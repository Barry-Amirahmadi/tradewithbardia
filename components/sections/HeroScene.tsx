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

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { useScrollProgress } from "@/lib/motion/use-scroll-progress";
import TradingAnimation, {
  availableRenderers,
  hasClientRenderer,
} from "@/components/charts/TradingAnimation";
import { currentProfile, pickRenderer } from "@/lib/viz/capability";
import { resolveSceneState } from "@/lib/viz/scene-state";
import { heroScene } from "@/lib/viz/scenes/hero-scene";
import type { RendererId, TradingAnimationHandle } from "@/lib/viz/types";

const stageOrder = heroScene.stages.map((stage) => stage.id);

/**
 * This component names no renderer. It asks the registry which implementation
 * won for this device and renders whatever comes back, so adding a real-chart,
 * frame-sequence, video or WebGL renderer never touches this file — §21, §50.
 *
 * Cached at module scope because `useSyncExternalStore` requires a snapshot
 * that is stable across calls.
 */
let cachedPreferred: RendererId | null = null;

function preferredRenderer(): RendererId {
  cachedPreferred ??= pickRenderer(currentProfile(), availableRenderers);
  return cachedPreferred;
}

/** Capability cannot change mid-session; there is nothing to subscribe to. */
const subscribeCapability = () => () => {};

/** The server cannot know the device, so it always renders the static tier. */
const serverPreferredRenderer = (): RendererId => "static";

type StageKey = keyof Dictionary["hero"]["stages"];

interface Props {
  locale: Locale;
  direction: "ltr" | "rtl";
  hero: Dictionary["hero"];
  cta: string;
  /** Server-rendered provenance disclosure for the scene (§26). */
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
  cta,
  disclosure,
  children,
}: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TradingAnimationHandle | null>(null);

  // Capability is resolved from the device, never guessed on the server —
  // guessing wrong ships a canvas-tier experience to a phone that cannot
  // afford it (§48). Modelled as an external store so the client value arrives
  // without a setState-in-effect cascade.
  const preferred = useSyncExternalStore(
    subscribeCapability,
    preferredRenderer,
    serverPreferredRenderer,
  );

  // Renderers that were selected but never initialised this session. Recorded
  // so the chain can be walked past them rather than collapsing to static.
  const [failed, setFailed] = useState<readonly RendererId[]>([]);
  const [ready, setReady] = useState(false);
  const [stageId, setStageId] = useState<string>(stageOrder[0] ?? "market");
  const stageIdRef = useRef(stageId);

  const rendererId = failed.includes(preferred)
    ? pickRenderer(currentProfile(), availableRenderers, failed)
    : preferred;
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
    // chart resolves into the brand — §20's first and last beats. Written
    // straight to style, so neither costs a React render.
    const intro = introRef.current;
    if (intro !== null) {
      const out = clamp01((progress - 0.05) / 0.17);
      intro.style.opacity = String(1 - out);
      intro.style.transform = `translate3d(0, ${out * -28}px, 0)`;
      intro.style.visibility = out >= 1 ? "hidden" : "visible";
    }

    // Between the intro leaving and the outro arriving, the copy column would
    // otherwise sit empty for two thirds of the scroll. The stage narration
    // fills it, so text and chart move together instead of the chart carrying
    // the whole scene alone (§19 — one continuous scene).
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

    const { stage } = resolveSceneState(heroScene, progress);
    if (stage.id !== stageIdRef.current) {
      stageIdRef.current = stage.id;
      setStageId(stage.id);
    }
  }, []);

  useScrollProgress(sectionRef, onProgress);

  // Stop rendering entirely once the scene is off screen (§49). A canvas that
  // keeps painting behind three viewports of content is pure battery cost.
  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        if (entry.isIntersecting) handleRef.current?.resume();
        else handleRef.current?.suspend();
      },
      { rootMargin: "10% 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const stage = hero.stages[stageId as StageKey] ?? hero.stages.market;

  return (
    <div ref={sectionRef} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <div className="container-page grid w-full gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
          {/* Copy column. On mobile this sits above the chart and the grid
              collapses; §51 asks for a different composition, not a squeeze. */}
          {/* The three copy layers stack absolutely, so this box has to be tall
              enough for the tallest of them. Sized too tightly it clips the
              outro on a phone and only its button survives. */}
          <div className="relative min-h-[17rem] lg:min-h-[19rem]">
            <div ref={introRef} className="will-change-[opacity,transform]">
              <p className="type-label">{hero.eyebrow}</p>
              <h1 className="mt-4 type-h1">
                {hero.titleLine1}
                <span className="block text-secondary">{hero.titleLine2}</span>
              </h1>
              <p className="mt-6 max-w-[38ch] type-lead">
                {hero.lead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={`/${locale}/learn`} className="btn btn-primary">
                  {cta}
                </Link>
                <Link href={`/${locale}/systems`} className="btn btn-ghost">
                  {hero.ctaSecondary}
                </Link>
              </div>
            </div>

            {/* Stage narration. `key` on the inner block restarts the fade on
                every beat, so a stage change reads as a cut rather than a
                silent text swap. */}
            <div
              ref={narrationRef}
              className="absolute inset-0 flex flex-col justify-center"
              style={{ opacity: 0, visibility: "hidden" }}
              aria-live="polite"
            >
              <div key={stageId} className="animate-[menu-reveal_var(--dur-slow)_var(--ease-precision)]">
                <p className="type-label text-accent">{stage.label}</p>
                <p className="mt-4 max-w-[22ch] type-h2">
                  {stage.caption}
                </p>
              </div>
            </div>

            <div
              ref={outroRef}
              className="absolute inset-0 flex flex-col justify-center"
              style={{ opacity: 0, visibility: "hidden" }}
            >
              <p className="type-label">{hero.stages.system.label}</p>
              <p className="mt-4 max-w-[26ch] type-h2">
                {hero.stages.system.caption}
              </p>
              <div className="mt-8">
                <Link href={`/${locale}/setups`} className="btn btn-primary">
                  {hero.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>

          {/* Chart column. */}
          <figure className="m-0">
            <div className="relative h-[42svh] w-full rounded-[var(--radius-lg)] border border-subtle bg-surface lg:h-[60svh]">
              <TradingAnimation
                renderer={rendererId}
                scene={heroScene}
                progress={0}
                direction={direction}
                description={hero.sceneDescription}
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
              {/* Stage rail — where you are in the sequence, and how much is
                  left. Nine ticks, no labels: it orients without competing. */}
              <ol className="flex list-none gap-1.5 p-0" aria-hidden="true">
                {stageOrder.map((id) => (
                  <li
                    key={id}
                    className="h-px flex-1 transition-colors duration-[var(--dur-base)]"
                    style={{
                      backgroundColor:
                        stageOrder.indexOf(id) <= stageOrder.indexOf(stageId)
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
      </div>
    </div>
  );
}
