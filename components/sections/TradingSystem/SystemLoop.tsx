"use client";

import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { systemStages, type SystemStageId } from "@/lib/trading/system-stages";

/**
 * THE CLOSED LOOP — master prompt §1, §3.10, §8.
 *
 * The section's whole argument in one figure: nine stages on a ring, the last
 * feeding the first. Drawn as a ring rather than a numbered list because a
 * list has an end, and the claim being made is that this process does not —
 * review and data change what counts as context next time.
 *
 * Renderer notes:
 *
 * - SVG and DOM, no canvas and no WebGL. The figure is nine labelled points;
 *   a canvas would cost a renderer, a fallback and a measurement lifecycle to
 *   draw something vector graphics draw natively, and would put the stage
 *   names beyond reach of a screen reader (§25).
 * - Colour comes from the existing tokens. This is a system diagram, not a
 *   price chart, so it uses accent and border rather than the market
 *   vocabulary — those tokens mean bullish, liquidity, imbalance, and reusing
 *   them here would say something untrue (§7).
 * - Circular geometry is inherently direction-neutral, so the same figure is
 *   correct in RTL and LTR with no mirrored asset. Only the text alignment
 *   inside the labels follows the document.
 */

const RADIUS = 40;
const CENTRE = 50;
/** Nine points, evenly spaced, starting at the top. */
const STEP = 360 / systemStages.length;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pointAt(index: number): { x: number; y: number } {
  const angle = ((-90 + index * STEP) * Math.PI) / 180;
  return {
    x: CENTRE + RADIUS * Math.cos(angle),
    y: CENTRE + RADIUS * Math.sin(angle),
  };
}

interface Props {
  activeId: SystemStageId;
  /** Every stage reads as reached — the reduced-motion and no-JS state. */
  allActive?: boolean;
  system: Dictionary["system"];
}

export default function SystemLoop({ activeId, allActive = false, system }: Props) {
  const activeIndex = systemStages.findIndex((stage) => stage.id === activeId);
  const count = systemStages.length;

  /**
   * The arc ends ON the current node, not past it.
   *
   * Drawing `(index + 1) / 9` is the intuitive "four of nine stages done", but
   * node k sits at `k / 9` of the circle — so four ninths of arc lands exactly
   * on node five while node four is the one highlighted, and the figure
   * appears to be one stage ahead of the reader.
   *
   * The last stage is the deliberate exception: reaching `data` closes the
   * circle completely, because that is the section's entire claim — the
   * process returns to the market rather than ending.
   */
  const reachedFraction =
    allActive || activeIndex >= count - 1
      ? 1
      : Math.max(activeIndex, 0) / count;

  return (
    <figure className="system-loop m-0">
      <svg
        viewBox="0 0 100 100"
        className="system-loop-svg"
        role="img"
        aria-label={system.stagesLabel}
      >
        {/* The ring itself: the path every stage sits on. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />

        {/* Progress along the ring, drawn as a dash offset rather than an arc
            path so there is no trigonometry to get wrong at the wrap. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={0.9}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
          className="system-loop-progress"
          style={{
            // Circumference of a unit-viewBox circle at this radius.
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE * (1 - reachedFraction),
          }}
        />

        {systemStages.map((stage, index) => {
          const { x, y } = pointAt(index);
          const reached = allActive || index <= activeIndex;
          const current = !allActive && index === activeIndex;
          return (
            <circle
              key={stage.id}
              cx={x}
              cy={y}
              r={current ? 3.4 : 2}
              fill={reached ? "var(--accent)" : "var(--border-strong)"}
              stroke={reached ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
              className="system-loop-node"
            />
          );
        })}
      </svg>

      {/*
        The stage names as real text, not SVG labels. Nine rotated labels
        around a circle are unreadable at any size that fits a phone, and in
        Persian they would be rotated Persian — so the ring carries position
        and the list carries language. The list is also what a screen reader
        and a crawler actually read (§25).
      */}
      <ol className="system-loop-legend" aria-label={system.stagesLabel}>
        {systemStages.map((stage, index) => (
          <li
            key={stage.id}
            data-reached={allActive || index <= activeIndex}
            data-current={!allActive && index === activeIndex}
          >
            <span className="type-data system-loop-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{system.stages[stage.id].label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
