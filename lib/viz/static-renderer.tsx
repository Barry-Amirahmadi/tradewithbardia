import { marketVar } from "./market-tokens";
import { resolveSceneState, slotCount, visibleBounds } from "./scene-state";
import type { Annotation, TradingAnimationProps } from "./types";

/**
 * STATIC RENDERER — the floor of the §50 fallback chain, and the whole
 * experience for anyone who asked for reduced motion (§13).
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
 *
 * TWO LAYERS, and the split is the point. The plot is an SVG stretched to fill
 * its box (`preserveAspectRatio="none"`), which is correct for candles and
 * price lines — every charting package stretches them, and a chart with
 * letterboxing above and below reads as broken. It is wrong for anything whose
 * shape carries meaning: a circle marking the sweep became a tall ellipse, and
 * text would have been stretched with it. So point marks and tags live in an
 * HTML layer positioned in percentages over the same coordinate space, where
 * a circle stays a circle and a label stays legible at any aspect ratio. That
 * also makes the tags real text — selectable, and reachable by a screen reader
 * following the figure's description.
 */

const VIEW_W = 1000;
const VIEW_H = 480;
const PAD = { top: 24, bottom: 24, left: 16, right: 16 };

/** An undistorted overlay item: a point mark, a text tag, or both. */
interface Mark {
  id: string;
  /** Percentages of the host box. */
  left: number;
  top: number;
  opacity: number;
  color: string;
  label?: string;
  dot?: "sweep" | "swing";
  /** Anchor the label from the box's right edge instead of `left`. */
  fromRight?: boolean;
}

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

  // Viewport → percentage of the host box. The SVG stretches to fill, so the
  // two coordinate systems stay in register at any aspect ratio.
  const px = (viewX: number) => (viewX / VIEW_W) * 100;
  const py = (viewY: number) => (viewY / VIEW_H) * 100;

  const revealed = Math.min(Math.ceil(state.revealed), scene.candles.length);
  const gridLines = 5;

  const marks = scene.annotations.flatMap((annotation) => {
    const opacity = state.opacity.get(annotation.id) ?? 0;
    if (opacity <= 0.01) return [];
    return markFor(annotation, opacity, x, y, px, py);
  });

  return (
    <div className={className} data-direction={direction} data-provenance={scene.provenance}>
      <div className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={description}
          className="h-full w-full"
        >
          <g style={{ stroke: marketVar("grid") }} strokeWidth={1} vectorEffect="non-scaling-stroke">
            {Array.from({ length: gridLines + 1 }, (_, i) => {
              const price = bounds.min + ((bounds.max - bounds.min) * i) / gridLines;
              const gy = y(price);
              return (
                <line
                  key={`grid-${i}`}
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={gy}
                  y2={gy}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>

          {scene.candles.slice(0, revealed).map((candle, index) => {
            const bullish = candle.c >= candle.o;
            const color = bullish ? marketVar("bullish") : marketVar("bearish");
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

        {/*
          Undistorted layer. `dir="ltr"` because chart space does not mirror:
          time runs left to right in both locales, so these coordinates are
          physical on purpose — the documented §17 exception, same rule the
          canvas renderer follows.
        */}
        <div className="chart-overlay" dir="ltr" aria-hidden="true">
          {marks.map((mark) => (
            <span
              key={mark.id}
              className={mark.dot === undefined ? "chart-tag" : `chart-mark chart-mark-${mark.dot}`}
              style={{
                [mark.fromRight === true ? "right" : "left"]:
                  mark.fromRight === true ? `${100 - mark.left}%` : `${mark.left}%`,
                top: `${mark.top}%`,
                opacity: mark.opacity,
                color: mark.color,
                borderColor: mark.color,
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The annotation vocabulary, in the same words the canvas renderer uses. A
 * visitor who learns that LIQ is a dashed line here recognises it in the
 * Setup Lab later, which is the whole reason the vocabulary is shared (§19).
 */
function markFor(
  annotation: Annotation,
  opacity: number,
  x: (index: number) => number,
  y: (price: number) => number,
  px: (viewX: number) => number,
  py: (viewY: number) => number,
): Mark[] {
  switch (annotation.kind) {
    case "swing":
      return [
        {
          id: annotation.id,
          left: px(x(annotation.index)),
          top: py(y(annotation.price) + (annotation.side === "high" ? -7 : 7)),
          opacity,
          color: marketVar("annotation"),
          dot: "swing",
        },
      ];

    case "liquidity":
      return [
        {
          id: annotation.id,
          left: px(x(annotation.fromIndex) + 6),
          top: py(y(annotation.price) - 12),
          opacity,
          color: marketVar("liquidity"),
          label: "LIQ",
        },
      ];

    case "sweep":
      return [
        {
          id: `${annotation.id}-mark`,
          left: px(x(annotation.index)),
          top: py(y(annotation.price)),
          opacity,
          color: marketVar("sweep"),
          dot: "sweep",
        },
        {
          id: annotation.id,
          left: px(x(annotation.index) + 16),
          top: py(y(annotation.price)),
          opacity,
          color: marketVar("sweep"),
          label: "SWEEP",
        },
      ];

    case "structure":
      return [
        {
          id: annotation.id,
          left: px(x(annotation.toIndex) + 6),
          top: py(y(annotation.price)),
          opacity,
          color: marketVar("structure"),
          label: "MSS",
        },
      ];

    case "zone":
      return [
        {
          id: annotation.id,
          left: px(x(annotation.fromIndex)),
          top: py(y(annotation.top) - 11),
          opacity,
          color:
            annotation.tone === "long"
              ? marketVar("bullish")
              : annotation.tone === "short"
                ? marketVar("imbalance")
                : marketVar("annotation"),
          label: "FVG",
        },
      ];

    case "level":
      return [
        {
          id: annotation.id,
          // Anchored from the right edge: these lines all run to the end of
          // the plot, so a left-anchored label would sit on top of the candles.
          left: px(VIEW_W - PAD.right - 6),
          top: py(y(annotation.price) - 11),
          opacity,
          color:
            annotation.role === "stop"
              ? marketVar("stop")
              : annotation.role === "target"
                ? marketVar("target")
                : marketVar("entry"),
          label: annotation.role.toUpperCase(),
          fromRight: true,
        },
      ];
  }
}

/**
 * The SVG half: only shapes whose meaning survives being stretched. Points and
 * text moved to the HTML overlay — see the note at the top of the file.
 */
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
    case "sweep":
      // Point marks: drawn undistorted in the overlay.
      return null;

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
          style={{ stroke: marketVar("liquidity") }}
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
          style={{ stroke: marketVar("structure") }}
        />
      );

    case "zone": {
      const left = x(annotation.fromIndex) - step / 2;
      const top = y(annotation.top);
      const height = Math.max(1, y(annotation.bottom) - top);
      const tone =
        annotation.tone === "long"
          ? marketVar("bullish")
          : annotation.tone === "short"
            ? marketVar("imbalance")
            : marketVar("annotation");
      return (
        <g opacity={opacity}>
          <rect
            x={left}
            y={top}
            width={plotRight - left}
            height={height}
            opacity={0.18}
            style={{ fill: tone }}
          />
          <rect
            x={left}
            y={top}
            width={plotRight - left}
            height={height}
            opacity={0.5}
            fill="none"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: tone }}
          />
        </g>
      );
    }

    case "level": {
      const color =
        annotation.role === "stop"
          ? marketVar("stop")
          : annotation.role === "target"
            ? marketVar("target")
            : marketVar("entry");
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
