"use client";

import { useEffect, useRef } from "react";

import { onFrame } from "@/lib/motion/frame-loop";
import { marketTokens, type MarketRole } from "./market-tokens";
import { renderBudget, type RenderBudget } from "./render-profile";
import {
  normalizeProgress,
  resolveSceneState,
  slotCount,
  visibleBounds,
  type SceneState,
} from "./scene-state";
import type {
  Annotation,
  TradingAnimationHandle,
  TradingAnimationProps,
} from "./types";

/**
 * CANVAS RENDERER — the Phase 0 implementation of the §21 abstraction.
 *
 * Everything here runs outside React. The scroll engine calls `setProgress`
 * on the imperative handle and this module owns its own animation frame; React
 * re-renders exactly zero times while the hero scene plays (§57).
 *
 * Text drawn into the canvas is limited to short mono tags — SWEEP, MSS, FVG —
 * which are written the same way in Persian and English trading discourse.
 * All localized prose lives in the HTML beside the figure, where screen
 * readers and search engines can reach it (§62, §63).
 */

/** Resolved rgb() for every role in the shared vocabulary. */
type Palette = Record<MarketRole, string>;

/**
 * Every colour the chart draws comes from the trading vocabulary in
 * globals.css (§19, §21), via the one shared token list. None of these map to
 * a generic UI token: the renderer used to draw liquidity and the sweep with
 * `--accent`, the structure break with `--text-primary` and the imbalance with
 * the bearish candle colour, which meant the chart's meaning lived in renderer
 * code rather than in the design system.
 */
const TOKENS = marketTokens;

/**
 * Custom properties holding `light-dark()` do not resolve when read straight
 * off `getComputedStyle` — the function is only evaluated once the value lands
 * on a real property. So assign each token to `color` on a throwaway probe and
 * read back the resolved rgb(). This is what makes the canvas follow the theme
 * toggle instead of freezing on whichever theme happened to load first.
 */
function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);

  const read = (token: string): string => {
    probe.style.color = "";
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };

  // Filled by iterating TOKENS rather than by restating every role, so the
  // token list stays the single source of truth. Completeness is guaranteed at
  // compile time by `satisfies Record<keyof Palette, string>` on TOKENS: adding
  // a Palette role without its token is a type error, not a runtime hole.
  const palette = {} as Palette;
  for (const role of Object.keys(TOKENS) as MarketRole[]) {
    palette[role] = read(TOKENS[role]);
  }

  probe.remove();
  return palette;
}

/**
 * Chart type, read from the same tokens as the rest of the product (§20).
 * The renderer previously hardcoded `9px ui-monospace` and `10px ui-monospace`,
 * which meant the chart quietly opted out of the typography system — change
 * the mono face and every label except the chart's would follow.
 *
 * Unlike the colours, these are plain values with no `light-dark()`, so they
 * resolve straight off `getComputedStyle` without the probe.
 */
interface ChartType {
  family: string;
  axisSize: number;
  tagSize: number;
  /**
   * The surface the plot sits on, used as a plate behind annotation labels.
   * Deliberately not part of the trading vocabulary: it describes the chart's
   * chrome, not a market concept, so it does not belong in `marketTokens`.
   */
  backdrop: string;
}

function readChartType(host: HTMLElement, compact: boolean): ChartType {
  const styles = getComputedStyle(host);
  const px = (token: string, fallback: number): number => {
    const parsed = Number.parseFloat(styles.getPropertyValue(token));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  // The mono stack has to land on a real property to resolve its var() chain.
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.fontFamily = "var(--font-mono)";
  host.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || "ui-monospace, monospace";
  // Same light-dark() resolution trick as the palette: assign, then read back.
  probe.style.color = "var(--surface)";
  const backdrop = getComputedStyle(probe).color;
  probe.remove();

  return {
    family,
    backdrop,
    axisSize: compact
      ? px("--chart-axis-size-compact", 9)
      : px("--chart-axis-size", 10),
    tagSize: compact
      ? px("--chart-tag-size-compact", 8)
      : px("--chart-tag-size", 9),
  };
}

/** rgb(r g b) → rgb(r g b / alpha), without a colour library. */
function withAlpha(color: string, alpha: number): string {
  const parts = color.match(/-?[\d.]+/g);
  if (parts === null || parts.length < 3) return color;
  const [r, g, b] = parts;
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * ATMOSPHERE — master prompt §22.
 *
 * The only ambient effect in the hero, and it earns its frame budget by being
 * the argument rather than decoration: a field of unresolved ticks behind the
 * plot that thins out as structure arrives. The page's claim is "the market is
 * noise until you know what to look for", and this is that sentence drawn —
 * the noise does not fade because a designer wanted a fade, it fades because
 * the viewer has learned to read it.
 *
 * Positions are generated once from a fixed seed into a flat array. Nothing is
 * allocated per frame, and the field is identical on every device and every
 * reload, so it can be described and reasoned about rather than being a
 * different accident each visit.
 */
const NOISE_SEED = 0x51ded1;
const noiseField = buildNoiseField(320);

function buildNoiseField(count: number): Float32Array {
  // x, y, weight per point.
  const points = new Float32Array(count * 3);
  let a = NOISE_SEED >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    points[i * 3] = rand();
    points[i * 3 + 1] = rand();
    points[i * 3 + 2] = 0.25 + rand() * 0.75;
  }
  return points;
}

/**
 * Where the noise stands on its way out, 1 → 0.
 *
 * Tied to the beats rather than to raw progress so the dissolve stays aligned
 * with the story if the timeline is re-paced: full through MARKET and NOISE,
 * clearing across STRUCTURE, gone by the time liquidity is named.
 */
function noiseOpacity(state: SceneState): number {
  switch (state.stage.id) {
    case "market":
      return 0.55 + 0.45 * state.stageProgress;
    case "noise":
      return 1;
    case "structure":
      return 1 - state.stageProgress;
    default:
      return 0;
  }
}

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  budget: RenderBudget,
  state: SceneState,
  plot: { left: number; top: number; width: number; height: number },
): void {
  if (!budget.atmosphere || budget.noisePoints <= 0) return;

  const strength = noiseOpacity(state);
  if (strength <= 0.01) return;

  const count = Math.min(budget.noisePoints, noiseField.length / 3);
  const size = plot.width < 520 ? 1 : 1.5;
  ctx.fillStyle = palette.neutral;

  for (let i = 0; i < count; i += 1) {
    const px = plot.left + noiseField[i * 3]! * plot.width;
    const py = plot.top + noiseField[i * 3 + 1]! * plot.height;
    const weight = noiseField[i * 3 + 2]!;
    ctx.globalAlpha = strength * weight * 0.32;
    ctx.fillRect(px, py, size, size);
  }

  ctx.globalAlpha = 1;
}

export default function CanvasTradingAnimation({
  scene,
  progress,
  direction,
  description,
  profile = "high",
  className,
  onReady,
}: TradingAnimationProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const progressRef = useRef(progress);
  const paletteRef = useRef<Palette | null>(null);
  const typeRef = useRef<ChartType | null>(null);
  const dirtyRef = useRef(true);

  /**
   * Explicit loop lifecycle: start → running → suspend → resume → destroy.
   *
   * `unsubscribeRef` non-null means "running". Suspending unsubscribes from
   * the shared frame loop outright rather than setting a flag and continuing
   * to be called — a suspended renderer should cost nothing, and the previous
   * version rescheduled itself every 16ms for the life of the page even while
   * suspended. `destroyedRef` makes the transition terminal, so a late
   * resume() from an in-flight observer callback cannot revive an unmounted
   * renderer.
   */
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const destroyedRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const stopRef = useRef<() => void>(() => {});
  // True while the camera is still easing toward its target, so the loop keeps
  // drawing after scroll has stopped instead of freezing mid-glide.
  const settlingRef = useRef(false);
  // Smoothed price window, so the vertical camera glides as new candles
  // widen the range instead of snapping on every reveal.
  const cameraRef = useRef<{ min: number; max: number } | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const budgetRef = useRef<RenderBudget>(renderBudget(profile));

  useEffect(() => {
    const handle: TradingAnimationHandle = {
      setProgress(next: number) {
        // Normalized at the boundary. Everything downstream — the camera, the
        // reveal, every coordinate — is arithmetic on this number, and a
        // single NaN reaching it paints an empty canvas that looks exactly
        // like a renderer that failed to mount.
        progressRef.current = normalizeProgress(next);
        dirtyRef.current = true;
      },
      suspend() {
        stopRef.current();
      },
      resume() {
        dirtyRef.current = true;
        startRef.current();
      },
    };
    onReady?.(handle);
  }, [onReady]);

  // `progress` is the initial/SSR value only. Once the scroll engine has the
  // handle it drives the canvas through `setProgress` and this never fires
  // again — which is the point (§57).
  useEffect(() => {
    progressRef.current = normalizeProgress(progress);
    dirtyRef.current = true;
  }, [progress]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (host === null || canvas === null) return;

    const context = canvas.getContext("2d");
    if (context === null) return;

    paletteRef.current = readPalette(host);
    typeRef.current = readChartType(host, host.getBoundingClientRect().width < 640);

    let resizeAttempts = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();

      // A zero-area box means layout has not settled — stylesheets still in
      // flight, or the element is in a collapsed ancestor. Committing that
      // measurement bakes a 0px canvas that only a later resize can undo, and
      // in any environment where observer callbacks are throttled, that later
      // resize never comes. Re-measure next frame instead of accepting it,
      // but bounded: an element that is genuinely display:none would otherwise
      // retry forever.
      if (rect.width < 1 || rect.height < 1) {
        if (resizeAttempts < 60) {
          resizeAttempts += 1;
          requestAnimationFrame(resize);
        }
        return;
      }
      resizeAttempts = 0;

      // Budget is re-derived here rather than on mount because it depends on
      // density as well as capability, and density changes when the box does.
      const budget = renderBudget(profile, rect.width < 640);
      budgetRef.current = budget;

      // The ceiling comes from the budget: beyond it the pixel cost climbs
      // faster than anything becomes visible, and on a low profile that fill
      // rate is the difference between a smooth scrub and a stuttering one.
      const dpr = Math.min(window.devicePixelRatio || 1, budget.maxDpr);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      // Chart type is density-dependent, so it is re-read whenever the box
      // changes rather than only on mount — otherwise crossing the compact
      // boundary leaves the axis set at the wrong size until a theme change.
      typeRef.current = readChartType(host, rect.width < 640);
      dirtyRef.current = true;
    };

    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    // Theme can change two ways: the toggle writes data-theme, or the OS
    // preference flips underneath a user who never touched the toggle.
    const refreshPalette = () => {
      paletteRef.current = readPalette(host);
      typeRef.current = readChartType(host, host.getBoundingClientRect().width < 640);
      dirtyRef.current = true;
    };
    const themeObserver = new MutationObserver(refreshPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", refreshPalette);

    const draw = (ctx: CanvasRenderingContext2D) => {
      const palette = paletteRef.current;
      const chartType = typeRef.current;
      const { width, height, dpr } = sizeRef.current;
      if (palette === null || chartType === null || width === 0 || height === 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const budget = budgetRef.current;
      const state = resolveSceneState(scene, progressRef.current);
      const target = visibleBounds(scene, state.revealed);

      // Eased toward the target rather than snapped, so the vertical camera
      // glides as new candles widen the range. Deliberate, not springy (§54).
      // The rate is budgeted: a slower glide is more frames drawn after the
      // scroll has already stopped, which is exactly what a low-end device
      // cannot afford.
      const camera = cameraRef.current ?? target;
      const eased = {
        min: camera.min + (target.min - camera.min) * budget.cameraEasing,
        max: camera.max + (target.max - camera.max) * budget.cameraEasing,
      };
      cameraRef.current = eased;
      // Still settling? Keep drawing next frame even if progress is static.
      settlingRef.current =
        Math.abs(eased.min - target.min) > 0.002 ||
        Math.abs(eased.max - target.max) > 0.002;

      const compact = width < 640;
      const axisWidth = compact ? 44 : 62;
      const padding = {
        top: compact ? 18 : 28,
        bottom: compact ? 20 : 28,
        left: compact ? 8 : 20,
        right: axisWidth,
      };

      const plotWidth = Math.max(1, width - padding.left - padding.right);
      const plotHeight = Math.max(1, height - padding.top - padding.bottom);
      const step = plotWidth / slotCount(state.revealed);
      const bodyWidth = Math.max(1, Math.min(step * 0.6, compact ? 16 : 28));

      const x = (index: number) => padding.left + (index + 0.5) * step;
      const y = (price: number) =>
        padding.top +
        ((eased.max - price) / Math.max(eased.max - eased.min, 1e-6)) *
          plotHeight;

      // Behind everything: the unresolved market, dissolving as the beats
      // teach the viewer what to look at.
      drawAtmosphere(ctx, palette, budget, state, {
        left: padding.left,
        top: padding.top,
        width: plotWidth,
        height: plotHeight,
      });

      drawGrid(ctx, palette, chartType, budget, eased, padding.left, plotWidth, width - axisWidth + 10, y);

      // In the closing stage the candles recede and the annotations stay lit:
      // the noise fades and what is left is the structure. §20's final beat,
      // done with opacity rather than a second scene.
      const candleAlpha =
        state.stage.id === "system" ? 1 - 0.6 * state.stageProgress : 1;

      drawCandles(ctx, palette, scene.candles, state.revealed, x, y, bodyWidth, candleAlpha, budget);

      for (const annotation of scene.annotations) {
        const alpha = state.opacity.get(annotation.id) ?? 0;
        if (alpha <= 0.01) continue;
        drawAnnotation(ctx, palette, chartType, budget, annotation, alpha, x, y, step, compact, plotWidth, padding.left);
      }
    };

    const render = () => {
      if (!dirtyRef.current && !settlingRef.current) return;
      dirtyRef.current = false;
      draw(context);
    };

    // Subscribes to the ONE application frame loop rather than opening a second
    // RAF chain (§56). Idempotent in both directions.
    const start = () => {
      if (destroyedRef.current || unsubscribeRef.current !== null) return;
      unsubscribeRef.current = onFrame(render);
    };

    const stop = () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };

    destroyedRef.current = false;
    startRef.current = start;
    stopRef.current = stop;
    start();

    return () => {
      // destroy: terminal, and prevents any later resume() from scheduling.
      destroyedRef.current = true;
      stop();
      startRef.current = () => {};
      stopRef.current = () => {};
      resizeObserver.disconnect();
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", refreshPalette);
    };
  }, [scene, profile]);

  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={description}
      data-direction={direction}
      data-provenance={scene.provenance}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

/**
 * Price axis sits on the right in both directions. Charts are not prose: time
 * runs left-to-right and the axis stays put, matching every trading terminal a
 * Persian-reading trader already uses. Mirroring it would be a localisation
 * that makes the product harder to read, not easier (§17).
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  chartType: ChartType,
  budget: RenderBudget,
  bounds: { min: number; max: number },
  plotLeft: number,
  plotWidth: number,
  axisX: number,
  y: (price: number) => number,
): void {
  const lines = budget.gridLines;
  ctx.lineWidth = 1;
  ctx.font = `${chartType.axisSize}px ${chartType.family}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.strokeStyle = withAlpha(palette.grid, 0.75);
  ctx.fillStyle = withAlpha(palette.axis, 0.85);

  for (let i = 0; i <= lines; i += 1) {
    const price = bounds.min + ((bounds.max - bounds.min) * i) / lines;
    const py = Math.round(y(price)) + 0.5;

    ctx.beginPath();
    ctx.moveTo(plotLeft, py);
    ctx.lineTo(plotLeft + plotWidth, py);
    ctx.stroke();

    ctx.fillText(price.toFixed(1), axisX, py);
  }
}

function drawCandles(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  candles: TradingAnimationProps["scene"]["candles"],
  revealed: number,
  x: (index: number) => number,
  y: (price: number) => number,
  bodyWidth: number,
  globalAlpha: number,
  budget: RenderBudget,
): void {
  const whole = Math.floor(revealed);
  const partial = revealed - whole;

  for (let i = 0; i < Math.min(whole + 1, candles.length); i += 1) {
    const candle = candles[i];
    if (candle === undefined) continue;

    // The newest candle draws itself in rather than appearing at full weight.
    const alpha = (i === whole ? partial : 1) * globalAlpha;
    if (alpha <= 0.01) continue;

    const bullish = candle.c >= candle.o;
    const color = bullish ? palette.bullish : palette.bearish;
    const cx = x(i);

    if (budget.wicks) {
      ctx.strokeStyle = withAlpha(color, alpha * 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, y(candle.h));
      ctx.lineTo(Math.round(cx) + 0.5, y(candle.l));
      ctx.stroke();
    }

    const top = y(Math.max(candle.o, candle.c));
    const bottom = y(Math.min(candle.o, candle.c));
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.fillRect(cx - bodyWidth / 2, top, bodyWidth, Math.max(1, bottom - top));
  }
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  chartType: ChartType,
  budget: RenderBudget,
  annotation: Annotation,
  alpha: number,
  x: (index: number) => number,
  y: (price: number) => number,
  step: number,
  compact: boolean,
  plotWidth: number,
  plotLeft: number,
): void {
  const tagFont = `${chartType.tagSize}px ${chartType.family}`;

  const tag = (text: string, px: number, py: number, color: string, align: CanvasTextAlign = "left") => {
    if (!budget.tags) return;
    ctx.font = tagFont;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";

    // A plate behind the text. The dense right-hand side of the setup puts
    // ENTRY, STOP, TARGET and FVG directly over candle bodies, and a label
    // that has to be deciphered against a red candle is worse than no label —
    // it makes the chart look busy AND says nothing. Sized from the measured
    // text so it never becomes a box floating around a short word.
    const width = ctx.measureText(text).width;
    const padX = 3;
    const height = chartType.tagSize + 5;
    const plateLeft =
      align === "right" ? px - width - padX : align === "center" ? px - width / 2 - padX : px - padX;
    ctx.fillStyle = withAlpha(chartType.backdrop, alpha * 0.85);
    ctx.fillRect(plateLeft, py - height / 2, width + padX * 2, height);

    ctx.fillStyle = withAlpha(color, alpha);
    ctx.fillText(text, px, py);
  };

  switch (annotation.kind) {
    case "swing": {
      const px = x(annotation.index);
      const py = y(annotation.price);
      const offset = annotation.side === "high" ? -7 : 7;
      ctx.fillStyle = withAlpha(palette.annotation, alpha);
      ctx.beginPath();
      ctx.arc(px, py + offset, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "liquidity": {
      const py = Math.round(y(annotation.price)) + 0.5;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = withAlpha(palette.liquidity, alpha * 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(annotation.fromIndex), py);
      ctx.lineTo(plotLeft + plotWidth, py);
      ctx.stroke();
      ctx.restore();
      tag("LIQ", x(annotation.fromIndex) + 4, py - 8, palette.liquidity);
      break;
    }

    case "sweep": {
      const px = x(annotation.index);
      const py = y(annotation.price);
      ctx.strokeStyle = withAlpha(palette.sweep, alpha);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, compact ? 5 : 7, 0, Math.PI * 2);
      ctx.stroke();
      tag("SWEEP", px + (compact ? 8 : 11), py, palette.sweep);
      break;
    }

    case "structure": {
      const py = Math.round(y(annotation.price)) + 0.5;
      ctx.strokeStyle = withAlpha(palette.structure, alpha * 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(annotation.fromIndex), py);
      ctx.lineTo(x(annotation.toIndex), py);
      ctx.stroke();
      tag("MSS", x(annotation.toIndex) + 4, py, palette.structure);
      break;
    }

    case "zone": {
      const left = x(annotation.fromIndex) - step / 2;
      const right = plotLeft + plotWidth;
      const top = y(annotation.top);
      const bottom = y(annotation.bottom);
      const tone =
        annotation.tone === "long"
          ? palette.bullish
          : annotation.tone === "short"
            ? palette.imbalance
            : palette.annotation;

      ctx.fillStyle = withAlpha(tone, alpha * 0.16);
      ctx.fillRect(left, top, right - left, Math.max(1, bottom - top));
      ctx.strokeStyle = withAlpha(tone, alpha * 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, Math.round(top) + 0.5, right - left - 1, Math.max(1, Math.round(bottom - top)));
      tag("FVG", left + 4, top - 7, tone);
      break;
    }

    case "level": {
      const py = Math.round(y(annotation.price)) + 0.5;
      const color =
        annotation.role === "stop"
          ? palette.stop
          : annotation.role === "target"
            ? palette.target
            : palette.entry;

      ctx.save();
      if (annotation.role !== "entry") ctx.setLineDash([2, 3]);
      ctx.strokeStyle = withAlpha(color, alpha * 0.9);
      ctx.lineWidth = annotation.role === "entry" ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x(annotation.fromIndex), py);
      ctx.lineTo(plotLeft + plotWidth, py);
      ctx.stroke();
      ctx.restore();

      const label = annotation.role.toUpperCase();
      tag(label, plotLeft + plotWidth - 4, py - 7, color, "right");
      break;
    }
  }
}
