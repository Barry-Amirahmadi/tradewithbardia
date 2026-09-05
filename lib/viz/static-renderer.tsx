import { resolveSceneState, slotCount, visibleBounds } from "./scene-state";
import type { Annotation, TradingAnimationProps } from "./types";

/**
 * STATIC RENDERER — the floor of the §50 fallback chain.
 *
 * A server component: no "use client", no hooks, no measurement. This is what
 * the server sends on every request and what a visitor sees with JavaScript
 * disabled, on a blocked canvas, or under a reduced-motion preference where a
 * scroll-scrubbed animation would be inappropriate anyway (§58).
 *
 * It renders the scene resolved at a fixed progress, so the fallback is the
 * finished diagram rather than an apology for a missing one. Because both
 * renderers resolve state through the same pure function, the static frame is
 * guaranteed to agree with what canvas draws at the same progress.
 */

const VIEW_W = 1000;
const VIEW_H = 480;
const PAD = { top: 24, bottom: 24, left: 16, right: 16 };

export default function StaticTradingAnimation({
  scene,
  progress,
  direction,
  description,
  className,
}: TradingAnimationProps) {
  const state = resolveSceneState(scene, progress);
  const bounds = visibleBounds(scene, state.revealed);

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  // Same slot rule as the canvas renderer, so the static frame and the live
  // one are the same picture at the same progress.
  const step = plotW / slotCount(state.revealed);
  const body = Math.max(1.5, step * 0.6);

  const x = (index: number) => PAD.left + (index + 0.5) * step;
  const y = (price: number) =>
    PAD.top +
    ((bounds.max - price) / Math.max(bounds.max - bounds.min, 1e-6)) * plotH;

  const revealed = Math.min(Math.ceil(state.revealed), scene.candles.length);
  const gridLines = 5;

  return (
    <div className={className} data-direction={direction} data-provenance={scene.provenance}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={description}
        className="h-full w-full"
      >
        <g style={{ stroke: "var(--market-grid)" }} strokeWidth={1} vectorEffect="non-scaling-stroke">
          {Array.from({ length: gridLines + 1 }, (_, i) => {
            const price = bounds.min + ((bounds.max - bounds.min) * i) / gridLines;
            const py = y(price);
            return (
              <line
                key={`grid-${i}`}
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={py}
                y2={py}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>

        {scene.candles.slice(0, revealed).map((candle, index) => {
          const bullish = candle.c >= candle.o;
          const color = bullish ? "var(--market-long)" : "var(--market-short)";
          const cx = x(index);
          const top = y(Math.max(candle.o, candle.c));
          const bottom = y(Math.min(candle.o, candle.c));
          return (
            <g key={`candle-${candle.t}`} style={{ fill: color, stroke: color }}>
              <line
                x1={cx}
                x2={cx}
                y1={y(candle.h)}
                y2={y(candle.l)}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={cx - body / 2}
                y={top}
                width={body}
                height={Math.max(1, bottom - top)}
              />
            </g>
          );
        })}

        {scene.annotations.map((annotation) => {
          const opacity = state.opacity.get(annotation.id) ?? 0;
          if (opacity <= 0.01) return null;
          return (
            <StaticAnnotation
              key={annotation.id}
              annotation={annotation}
              opacity={opacity}
              x={x}
              y={y}
              step={step}
              plotRight={PAD.left + plotW}
            />
          );
        })}
      </svg>
    </div>
  );
}

function StaticAnnotation({
  annotation,
  opacity,
  x,
  y,
  step,
  plotRight,
}: {
  annotation: Annotation;
  opacity: number;
  x: (index: number) => number;
  y: (price: number) => number;
  step: number;
  plotRight: number;
}) {
  switch (annotation.kind) {
    case "swing":
      return (
        <circle
          cx={x(annotation.index)}
          cy={y(annotation.price) + (annotation.side === "high" ? -7 : 7)}
          r={2.5}
          opacity={opacity}
          style={{ fill: "var(--text-secondary)" }}
        />
      );

    case "liquidity":
      return (
        <line
          x1={x(annotation.fromIndex)}
          x2={plotRight}
          y1={y(annotation.price)}
          y2={y(annotation.price)}
          opacity={opacity * 0.85}
          strokeDasharray="4 4"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "var(--accent)" }}
        />
      );

    case "sweep":
      return (
        <circle
          cx={x(annotation.index)}
          cy={y(annotation.price)}
          r={7}
          opacity={opacity}
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "var(--accent)" }}
        />
      );

    case "structure":
      return (
        <line
          x1={x(annotation.fromIndex)}
          x2={x(annotation.toIndex)}
          y1={y(annotation.price)}
          y2={y(annotation.price)}
          opacity={opacity * 0.8}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: "var(--text-primary)" }}
        />
      );

    case "zone": {
      const left = x(annotation.fromIndex) - step / 2;
      const top = y(annotation.top);
      const height = Math.max(1, y(annotation.bottom) - top);
      const tone =
        annotation.tone === "long"
          ? "var(--market-long)"
          : annotation.tone === "short"
            ? "var(--market-short)"
            : "var(--accent)";
      return (
        <rect
          x={left}
          y={top}
          width={plotRight - left}
          height={height}
          opacity={opacity * 0.18}
          style={{ fill: tone }}
        />
      );
    }

    case "level": {
      const color =
        annotation.role === "stop"
          ? "var(--market-short)"
          : annotation.role === "target"
            ? "var(--market-long)"
            : "var(--text-primary)";
      return (
        <line
          x1={x(annotation.fromIndex)}
          x2={plotRight}
          y1={y(annotation.price)}
          y2={y(annotation.price)}
          opacity={opacity * 0.9}
          strokeWidth={annotation.role === "entry" ? 1.5 : 1}
          strokeDasharray={annotation.role === "entry" ? undefined : "2 3"}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: color }}
        />
      );
    }
  }
}
