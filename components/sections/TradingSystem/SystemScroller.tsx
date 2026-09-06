"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import SystemLoop from "./SystemLoop";
import { track } from "@/lib/analytics";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/motion/frame-loop";
import { useScrollProgress } from "@/lib/motion/use-scroll-progress";
import { stageAt, systemStages, type SystemStageId } from "@/lib/trading/system-stages";

/**
 * SCROLL WIRING FOR THE TRADING SYSTEM SECTION — master prompt §9.
 *
 * Reuses EPIC 03's architecture wholesale: the shared frame loop through
 * `useScrollProgress`, and `stageAt`, which normalizes through the same
 * `normalizeProgress` the hero uses. No second scroll engine, no second RAF
 * chain, no scroll listener, no second Lenis instance.
 *
 * React renders here are bounded by the number of stages, not by frames: the
 * active stage is discrete state that changes at most eight times across the
 * whole section, and the per-frame value is written to a `data-stage`
 * attribute that CSS reads. The heavy content is server-rendered and arrives
 * as `children`, so a stage change re-renders the sticky column only.
 */

const FIRST_STAGE = systemStages[0];

interface Props {
  system: Dictionary["system"];
  /** Server-rendered header block. */
  header: ReactNode;
  /** Server-rendered stage articles. */
  children: ReactNode;
}

export default function SystemScroller({ system, header, children }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<SystemStageId>(FIRST_STAGE?.id ?? "market");
  const activeRef = useRef(active);
  const seen = useRef(new Set<SystemStageId>());

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );

  const onProgress = useCallback((progress: number) => {
    const stage = stageAt(progress);
    if (stage.id === activeRef.current) return;
    activeRef.current = stage.id;
    setActive(stage.id);

    // Reported once per stage per visit: entering a stage is the event, and a
    // reader scrolling back and forth should not inflate it into ten.
    if (!seen.current.has(stage.id)) {
      seen.current.add(stage.id);
      track("system_stage_enter", {
        id: `system.${stage.id}`,
        surface: "trading-system",
        count: stage.index + 1,
      });
    }
  }, []);

  // Under reduced motion the section is not scroll-driven: every stage reads
  // as reached and the loop is shown complete, so there is nothing to sample.
  useScrollProgress(sectionRef, onProgress, !reducedMotion);

  useEffect(() => {
    track("system_view", { surface: "trading-system" });
  }, []);

  return (
    <section
      ref={sectionRef}
      className="system-section"
      data-stage={active}
      data-mode={reducedMotion ? "static" : "cinematic"}
      aria-labelledby="trading-system-title"
    >
      <div className="container-page system-grid">
        <div className="system-aside">
          {header}
          <SystemLoop
            activeId={active}
            allActive={reducedMotion}
            system={system}
          />
        </div>
        <div className="system-stages">{children}</div>
      </div>
    </section>
  );
}
