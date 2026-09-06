"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import TradingAnimation, {
  availableRenderers,
  hasClientRenderer,
} from "@/components/charts/TradingAnimation";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import {
  prefersReducedMotion,
  subscribeReducedMotion,
} from "@/lib/motion/frame-loop";
import { useScrollProgress } from "@/lib/motion/use-scroll-progress";
import { currentProfile, pickRenderer } from "@/lib/viz/capability";
import { resolveSceneState } from "@/lib/viz/scene-state";
import {
  heroBeats,
  heroScene,
  type HeroBeat,
} from "@/lib/viz/scenes/hero-scene";
import type {
  PerformanceProfile,
  RendererId,
  TradingAnimationHandle,
} from "@/lib/viz/types";

/**
 * THE CINEMATIC HERO — master prompt §5–§9, §13–§18, §29, §30.
 *
 * Nine beats, one scroll track, one continuous idea: the market looks like
 * noise until you know what to look for. Everything on screen is a function of
 * a single normalized number, so the scene has no history to get wrong —
 * scrolling backwards, jumping with a link, restoring a position on reload and
 * resizing all arrive here as a value rather than as a sequence of events the
 * animation had to witness (§30).
 *
 * This component names no renderer. It asks capability for a tier and renders
 * whatever comes back, so adding a real-chart, frame-sequence, video or WebGL
 * renderer never touches this file — §10, §21, §50.
 *
 * Two modes, and the difference is a stated preference rather than a device
 * guess. CINEMATIC scrubs the sequence. STATIC — for anyone who asked for
 * reduced motion — presents the composition the sequence was building toward,
 * in a section that is no taller than its own content. Neither is a degraded
 * version of the other and neither drops the CTA (§13).
 */

/** Capability cannot change mid-session; there is nothing to subscribe to. */
const noSubscription = () => () => {};
/** The server cannot know the device, so it assumes the full experience and
 *  lets the client correct it — the same direction as every other upgrade. */
const serverProfile = (): PerformanceProfile => "high";
const serverReducedMotion = () => false;

const LAST_BEAT = heroBeats.length - 1;

interface Props {
  locale: Locale;
  direction: "ltr" | "rtl";
  hero: Dictionary["hero"];
  /** Server-rendered provenance disclosure for the scene (§20, §26). */
  disclosure: ReactNode;
  /** Server-rendered static fallback. */
  children: ReactNode;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export default function HeroScene({
  locale,
  direction,
  hero,
  disclosure,
  children,
}: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TradingAnimationHandle | null>(null);

  // Both read as external stores rather than as setState-on-mount effects, so
  // the client value arrives without a render cascade. Reduced motion is live:
  // someone who turns motion down mid-session because a page is making them
  // ill should not have to reload to be believed.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    serverReducedMotion,
  );
  const profile = useSyncExternalStore(
    noSubscription,
    currentProfile,
    serverProfile,
  );
  const cinematic = !reducedMotion;

  // Renderers that were selected but never initialised this session. Recorded
  // so the chain can be walked past them rather than collapsing to static.
  const [failed, setFailed] = useState<readonly RendererId[]>([]);
  const [ready, setReady] = useState(false);
  const [beat, setBeat] = useState<HeroBeat>(heroBeats[0]);
  const beatRef = useRef<HeroBeat>(beat);

  const rendererId = pickRenderer(
    profile,
    availableRenderers,
    failed,
    reducedMotion,
  );
  const clientRendered = hasClientRenderer(rendererId);

  const handleReady = useCallback((handle: TradingAnimationHandle) => {
    handleRef.current = handle;
    setReady(true);
  }, []);

  // The §50 chain is only real if it can be walked. If the selected renderer's
  // chunk never arrives — offline mid-navigation, a blocked script, a chunk
  // 404 after a bad deploy — record it as failed and let the chain resolve the
  // next one down, rather than leaving an empty frame where the hero should be.
  useEffect(() => {
    if (!clientRendered || ready) return;
    const timer = window.setTimeout(() => {
      if (handleRef.current === null) {
        setFailed((current) =>
          current.includes(rendererId) ? current : [...current, rendererId],
        );
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [clientRendered, ready, rendererId]);

  const onProgress = useCallback((progress: number) => {
    handleRef.current?.setProgress(progress);

    // Opening copy clears out of the way; the closing statement arrives as the
    // chart resolves into the brand — §8's first and last beats. Written
    // straight to style, so none of this costs a React render (§7, §11).
    const intro = introRef.current;
    if (intro !== null) {
      const out = clamp01((progress - 0.05) / 0.17);
      intro.style.opacity = String(1 - out);
      intro.style.transform = `translate3d(0, ${out * -28}px, 0)`;
      intro.style.visibility = out >= 1 ? "hidden" : "visible";
    }

    // Between the intro leaving and the outro arriving, the copy column would
    // otherwise sit empty for two thirds of the scroll. The beat narration
    // fills it, so text and chart move together instead of the chart carrying
    // the whole scene alone (§18 — reinforce the visual, do not narrate it).
    const narration = narrationRef.current;
    if (narration !== null) {
      const inn = clamp01((progress - 0.2) / 0.06);
      const out = clamp01((progress - 0.84) / 0.05);
      const visible = inn * (1 - out);
      narration.style.opacity = String(visible);
      narration.style.transform = `translate3d(0, ${(1 - visible) * 14}px, 0)`;
      narration.style.visibility = visible <= 0.01 ? "hidden" : "visible";
    }

    const outro = outroRef.current;
    if (outro !== null) {
      const inn = clamp01((progress - 0.87) / 0.1);
      outro.style.opacity = String(inn);
      outro.style.transform = `translate3d(0, ${(1 - inn) * 20}px, 0)`;
      outro.style.visibility = inn <= 0 ? "hidden" : "visible";
    }

    // The hint has done its job the moment the visitor scrolls at all.
    const hint = hintRef.current;
    if (hint !== null) {
      const gone = clamp01(progress / 0.04);
      hint.style.opacity = String(1 - gone);
      hint.style.visibility = gone >= 1 ? "hidden" : "visible";
    }

    const { stage } = resolveSceneState(heroScene, progress);
    const next = stage.id as HeroBeat;
    if (next !== beatRef.current) {
      beatRef.current = next;
      setBeat(next);
    }
  }, []);

  useScrollProgress(sectionRef, onProgress, cinematic);

  /**
   * Leaving cinematic mode hands the copy layers back to CSS.
   *
   * The frame loop writes opacity, transform and visibility straight onto
   * these nodes, and an inline style outranks any stylesheet rule regardless
   * of specificity. So a visitor who turns reduced motion on halfway through
   * the sequence would be left with whichever frame happened to be showing —
   * usually an invisible opening statement and an invisible closing one,
   * because at most one of the three layers is lit at any position.
   *
   * Removing exactly the properties this component set is what makes the
   * static composition a guarantee rather than a coincidence. It is written
   * out explicitly because the alternative is depending on a framework
   * detail to clean up after imperative writes it never knew about.
   */
  useEffect(() => {
    if (cinematic) return;
    for (const layer of [introRef, narrationRef, outroRef]) {
      const element = layer.current;
      if (element === null) continue;
      element.style.removeProperty("opacity");
      element.style.removeProperty("transform");
      element.style.removeProperty("visibility");
    }
  }, [cinematic]);

  /**
   * Turning reduced motion ON mid-session stops the frame loop without it
   * getting a final call, so whatever opacity and transform it wrote last
   * would stick — and if it stopped between beats, the copy is left invisible
   * with no way back. Inline styles outrank the stylesheet, so the layers have
   * to be handed back to CSS explicitly.
   */
  useEffect(() => {
    if (cinematic) return;
    for (const ref of [introRef, narrationRef, outroRef]) {
      const element = ref.current;
      if (element === null) continue;
      element.style.opacity = "";
      element.style.transform = "";
      element.style.visibility = "";
    }
  }, [cinematic]);

  /**
   * The renderer draws only when the scene is both on screen and on a page the
   * user is actually looking at (§11, §31). Two independent conditions, so
   * they are tracked separately and reconciled in one place — resuming on tab
   * focus while the hero is three viewports up would otherwise restart a loop
   * that should stay stopped.
   */
  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;

    let onScreen = true;
    let pageVisible = !document.hidden;

    const sync = () => {
      if (onScreen && pageVisible) handleRef.current?.resume();
      else handleRef.current?.suspend();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        onScreen = entry.isIntersecting;
        sync();
      },
      { rootMargin: "10% 0px" },
    );
    observer.observe(section);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const copy = hero.stages[beat];
  const railIndex = cinematic ? heroBeats.indexOf(beat) : LAST_BEAT;

  return (
    <div
      ref={sectionRef}
      className="hero-track"
      data-beat={cinematic ? beat : "system"}
      data-mode={cinematic ? "cinematic" : "static"}
    >
      <div className="hero-stage">
        <div className="container-page grid w-full gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
          {/* Copy column. On mobile it sits above the chart and the grid
              collapses — §15 asks for a different composition, not a squeeze.
              In cinematic mode the three layers stack in the same box and
              cross-fade; in static mode they fall into normal flow, which is
              why the height floor is conditional rather than baked in. */}
          <div className="hero-copy" data-mode={cinematic ? "cinematic" : "static"}>
            <div ref={introRef} className="hero-copy-intro">
              <p className="type-label">{hero.eyebrow}</p>
              <h1 className="mt-4 type-h1">
                {hero.titleLine1}
                <span className="block text-secondary">{hero.titleLine2}</span>
              </h1>
              <p className="mt-6 max-w-[38ch] type-lead">{hero.lead}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={`/${locale}/academy`} className="btn btn-primary">
                  {hero.ctaPrimary}
                </Link>
                <Link href={`/${locale}/systems`} className="btn btn-ghost">
                  {hero.ctaSecondary}
                </Link>
              </div>
            </div>

            {/* Beat narration. `key` on the inner block restarts the fade on
                every beat, so a beat change reads as a cut rather than a
                silent text swap. */}
            <div ref={narrationRef} className="hero-copy-narration" aria-live="polite">
              <div
                key={beat}
                className="animate-[menu-reveal_var(--dur-slow)_var(--ease-precision)]"
              >
                <p className="type-label text-accent">{copy.label}</p>
                <p className="mt-4 max-w-[22ch] type-h2">{copy.caption}</p>
              </div>
            </div>

            <div ref={outroRef} className="hero-copy-outro">
              <p className="type-label">{hero.stages.system.label}</p>
              <p className="mt-4 max-w-[26ch] type-h2">
                {hero.stages.system.caption}
              </p>
              {/* Only in cinematic mode: in static mode the intro's own CTA is
                  a few centimetres above this, and two identical buttons is
                  not emphasis, it is noise. */}
              {cinematic ? (
                <div className="mt-8">
                  <Link href={`/${locale}/academy`} className="btn btn-primary">
                    {hero.ctaPrimary}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          {/* Chart column. */}
          <figure className="m-0" aria-label={hero.sceneLabel}>
            <div className="relative h-[42svh] w-full rounded-[var(--radius-lg)] border border-subtle bg-surface lg:h-[60svh]">
              <TradingAnimation
                renderer={rendererId}
                scene={heroScene}
                progress={0}
                direction={direction}
                description={hero.sceneDescription}
                profile={profile}
                onReady={handleReady}
                className="absolute inset-0"
              />

              {/* Hidden as soon as a client renderer is CHOSEN, not when it is
                  ready. The static frame shows the finished setup, so holding
                  it until the renderer mounts would cross-fade a completed
                  diagram into an empty one. An empty frame is the correct
                  picture at scroll position zero. */}
              <div
                className="absolute inset-0 transition-opacity duration-[var(--dur-fast)]"
                style={{ opacity: clientRendered ? 0 : 1 }}
                aria-hidden={clientRendered}
              >
                {children}
              </div>
            </div>

            <figcaption className="mt-4 flex flex-col gap-3">
              {/* Beat rail — where you are in the sequence, and how much is
                  left. Nine ticks, no labels: it orients without competing.

                  `dir="ltr"` for the same reason the chart's own overlay is:
                  it sits directly under the plot and spans its width, so a
                  reader takes it as that plot's progress. Time in the chart
                  runs left to right in both locales — the documented §17
                  exception — and a rail filling the other way underneath it
                  contradicts the thing it is annotating. */}
              <ol className="flex list-none gap-1.5 p-0" dir="ltr" aria-hidden="true">
                {heroBeats.map((id, index) => (
                  <li
                    key={id}
                    className="h-px flex-1 transition-colors duration-[var(--dur-base)]"
                    style={{
                      backgroundColor:
                        index <= railIndex
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                    }}
                  />
                ))}
              </ol>

              {disclosure}
            </figcaption>
          </figure>
        </div>

        {cinematic ? (
          <div ref={hintRef} className="hero-hint type-label">
            <span>{hero.scrollHint}</span>
            <span className="hero-hint-arrow" aria-hidden="true">
              ↓
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
