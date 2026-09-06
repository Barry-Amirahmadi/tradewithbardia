"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import TradingAnimation, {
  availableRenderers,
  hasClientRenderer,
} from "@/components/charts/TradingAnimation";
import { track } from "@/lib/analytics";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { onFrame, prefersReducedMotion, subscribeReducedMotion } from "@/lib/motion/frame-loop";
import {
  progressAfter,
  progressForStage,
  replayStages,
  replayStateAt,
  REPLAY_DURATION_MS,
  type ReplayStageId,
} from "@/lib/trading/replay";
import { currentProfile, pickRenderer } from "@/lib/viz/capability";
import { heroScene } from "@/lib/viz/scenes/hero-scene";
import type { PerformanceProfile, RendererId, TradingAnimationHandle } from "@/lib/viz/types";

/**
 * THE REPLAY — master prompt §9, §10.
 *
 * A cinematic educational replay: the viewer walks a setup's reasoning from
 * market to review. Not a trading game — nothing here takes a position, and
 * no outcome is celebrated.
 *
 * ARCHITECTURE, and every one of these is a §9 requirement:
 *
 * - **No second RAF loop.** Playback subscribes to the shared `onFrame`, the
 *   same loop the hero and the navbar use.
 * - **No scroll engine and no scroll listener.** This is time-driven and
 *   scrub-driven, not scroll-driven, which is what makes it usable inside a
 *   page that already has a scroll-driven hero.
 * - **No React render per frame.** Progress goes to the renderer handle and to
 *   a `data-stage` attribute; React re-renders only when the stage changes,
 *   at most eight times per playthrough.
 * - **One renderer instance, viewport-gated.** It mounts only once the figure
 *   is on screen and suspends when it leaves or the tab is hidden. A library
 *   page never mounts one at all — that is what the card glyph is for (§2).
 *
 * The scene is the shared synthetic hero scene, disclosed as such by the
 * caller. Replacing it with a real chart, a frame sequence or recorded video
 * is a change to the façade's registry, not to this component (§10).
 */

const noSubscription = () => () => {};
const serverProfile = (): PerformanceProfile => "high";

interface Props {
  lab: Dictionary["lab"];
  /** Server-rendered provenance disclosure for the scene. */
  disclosure: ReactNode;
  description: string;
  direction: "ltr" | "rtl";
  setupSlug: string;
}

export default function SetupReplay({
  lab,
  disclosure,
  description,
  direction,
  setupSlug,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TradingAnimationHandle | null>(null);
  const progressRef = useRef(0);
  const startedAt = useRef<number | null>(null);

  const [stage, setStage] = useState<ReplayStageId>(replayStages[0]);
  const stageRef = useRef<ReplayStageId>(stage);
  const [playing, setPlaying] = useState(false);
  // Only used to keep the range input in sync; updated on stage change, not
  // per frame, so the slider is never the reason React re-renders.
  const [scrub, setScrub] = useState(0);
  const [visible, setVisible] = useState(false);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const profile = useSyncExternalStore(noSubscription, currentProfile, serverProfile);
  const rendererId: RendererId = pickRenderer(profile, availableRenderers, [], reducedMotion);
  const clientRendered = hasClientRenderer(rendererId);

  const applyProgress = useCallback((next: number) => {
    progressRef.current = next;
    handleRef.current?.setProgress(next);
    const state = replayStateAt(next);
    if (state.stage !== stageRef.current) {
      stageRef.current = state.stage;
      setStage(state.stage);
      setScrub(next);
    }
  }, []);

  // Mount the renderer only while the figure is on screen. One instance, and
  // none at all on a page that never scrolls it into view.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting === true),
      { rootMargin: "20% 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Playback. Subscribes to the shared loop only while actually playing, so a
  // paused replay costs nothing at all.
  useEffect(() => {
    if (!playing) return;
    startedAt.current = performance.now() - progressRef.current * REPLAY_DURATION_MS;

    const stop = onFrame((now) => {
      const elapsed = now - (startedAt.current ?? now);
      const next = progressAfter(elapsed);
      applyProgress(next);
      if (next >= 1) setPlaying(false);
    });
    return stop;
  }, [playing, applyProgress]);

  // Suspend when the tab is hidden or the figure leaves the viewport. Both
  // conditions are reconciled in one place so returning to a tab does not
  // resume a renderer that is scrolled away.
  useEffect(() => {
    const sync = () => {
      if (visible && !document.hidden) handleRef.current?.resume();
      else handleRef.current?.suspend();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [visible]);

  const state = replayStateAt(scrub);

  return (
    <figure className="replay m-0" ref={hostRef} data-stage={stage}>
      <div className="replay-frame">
        {visible && clientRendered ? (
          <TradingAnimation
            renderer={rendererId}
            scene={heroScene}
            // The React-visible value, not the ref: this is only the initial
            // frame, and the handle drives every frame after it.
            progress={scrub}
            direction={direction}
            description={description}
            profile={profile}
            onReady={(handle) => {
              handleRef.current = handle;
              handle.setProgress(progressRef.current);
            }}
            className="absolute inset-0"
          />
        ) : (
          // Before the figure is reached, and under reduced motion, the frame
          // holds its own space rather than collapsing and shifting the page.
          <div className="replay-placeholder" aria-hidden="true" />
        )}
      </div>

      <figcaption className="replay-caption">
        <div className="replay-controls">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const next = !playing;
              setPlaying(next);
              if (next) track("replay_play", { id: `setup.${setupSlug}`, surface: "setup-detail" });
            }}
            // Reduced motion does not remove the replay, it removes autoplay:
            // the reader scrubs it themselves and still sees every stage.
            disabled={reducedMotion}
          >
            {playing ? lab.replayPause : lab.replayPlay}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPlaying(false);
              applyProgress(0);
              setScrub(0);
            }}
          >
            {lab.replayRestart}
          </button>

          <label className="replay-scrub">
            <span className="sr-only">{lab.replayScrub}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrub}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPlaying(false);
                setScrub(next);
                applyProgress(next);
              }}
            />
          </label>
        </div>

        {/* The stages as buttons, so the replay is fully operable from the
            keyboard and on touch without dragging a slider (§18). */}
        <ol className="replay-stages" aria-label={lab.replayLabel}>
          {replayStages.map((id, index) => (
            <li key={id}>
              <button
                type="button"
                data-active={index === state.index}
                aria-current={index === state.index ? "step" : undefined}
                onClick={() => {
                  const next = progressForStage(id);
                  setPlaying(false);
                  setScrub(next);
                  applyProgress(next);
                }}
              >
                {lab.replayStages[id]}
              </button>
            </li>
          ))}
        </ol>

        {disclosure}
      </figcaption>
    </figure>
  );
}
