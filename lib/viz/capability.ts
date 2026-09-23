import type { PerformanceProfile, RendererId } from "./types";
import { rendererChain } from "./types";

/**
 * ADAPTIVE PERFORMANCE — master prompt §48, §49.
 *
 * Detection runs on the client only, after mount. The server always renders
 * the `static` tier, so the first paint is real content with no JavaScript
 * required and there is nothing to hydrate-mismatch. Anything better is an
 * upgrade applied afterwards (§50, §60).
 */

export interface DeviceSignals {
  reducedMotion: boolean;
  /** GiB, where the browser reports it. */
  deviceMemory: number | null;
  cores: number | null;
  saveData: boolean;
  effectiveType: string | null;
  coarsePointer: boolean;
  viewportWidth: number;
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function readSignals(): DeviceSignals {
  const nav = navigator as NavigatorWithHints;

  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores:
      typeof nav.hardwareConcurrency === "number"
        ? nav.hardwareConcurrency
        : null,
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType ?? null,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
  };
}

/*
 * THE WEBGL PROBE WAS REMOVED — EPIC 10 §21.
 *
 * `readSignals` used to create a canvas, acquire a WebGL context and throw it
 * away, purely so `profileFromSignals` could downgrade high to medium on a
 * device that could not allocate one. Measured in Chrome 152 on this machine:
 * **6.4 ms for the first probe, ~7 ms median** — paid on the main thread
 * during hydration, on every page load, on hardware far faster than the phones
 * this matters for.
 *
 * It bought a weak signal. No WebGL renderer exists, none is registered, and
 * the renderer chain in `types.ts` resolves to canvas or static either way, so
 * the probe could never gate an actual capability — only nudge one profile
 * boundary. The remaining signals — device memory, core count, and a coarse
 * pointer on a small viewport — describe a weak device more directly and cost
 * nothing to read.
 *
 * The behavioural change is that a device without WebGL but with healthy
 * memory and cores now resolves to `high` rather than `medium`. That affects
 * atmosphere density and noise-point count in the canvas renderer, never
 * correctness or content. If a WebGL renderer is ever built, the probe belongs
 * inside that renderer's own initialisation, where a failure can fall down the
 * chain — not in a startup path every visitor pays for.
 */

export function profileFromSignals(signals: DeviceSignals): PerformanceProfile {
  // Reduced motion is a stated preference, not a capability guess. It wins
  // outright — §58.
  if (signals.reducedMotion) return "low";
  if (signals.saveData) return "low";

  if (signals.effectiveType === "slow-2g" || signals.effectiveType === "2g") {
    return "low";
  }

  const lowMemory = signals.deviceMemory !== null && signals.deviceMemory <= 2;
  const fewCores = signals.cores !== null && signals.cores <= 2;
  if (lowMemory || fewCores) return "low";

  const midMemory = signals.deviceMemory !== null && signals.deviceMemory <= 4;
  const midCores = signals.cores !== null && signals.cores <= 4;
  const smallViewport = signals.viewportWidth < 768;

  if (midMemory || midCores || (signals.coarsePointer && smallViewport)) {
    return "medium";
  }

  return "high";
}

/** Which renderers each profile is permitted to reach for (§48). */
const permitted: Record<PerformanceProfile, readonly RendererId[]> = {
  high: rendererChain,
  medium: ["frames", "video", "canvas", "static"],
  low: ["canvas", "static"],
};

/**
 * Walk the §50 fallback chain and return the strongest renderer that is both
 * permitted by the profile and actually registered. Phase 0 registers `canvas`
 * and `static` only, so this currently resolves to canvas on every profile
 * except reduced-motion — which is the intended behaviour, not a stub.
 *
 * `failed` carries renderers that were selected but did not initialise this
 * session, so a downgrade continues down the chain rather than dropping
 * straight to the bottom of it. With four renderers registered, a WebGL
 * context that dies should land on frames, not on a static image.
 */
export function pickRenderer(
  profile: PerformanceProfile,
  available: ReadonlySet<RendererId>,
  failed: readonly RendererId[] = [],
  reducedMotion = false,
): RendererId {
  // A stated preference, not a capability guess, so it is answered before the
  // chain is consulted at all (§58). It used to fold into the `low` profile,
  // which still permitted canvas — meaning someone who asked the operating
  // system for less motion received a scroll-scrubbed animation anyway. The
  // static tier is not a degraded experience here: it is the finished SYSTEM
  // composition, which is what the sequence was building toward (§13).
  if (reducedMotion) return "static";

  for (const renderer of permitted[profile]) {
    if (available.has(renderer) && !failed.includes(renderer)) return renderer;
  }
  return "static";
}

/**
 * Device capability is fixed for the page's lifetime, so the profile is
 * resolved once and cached. Exposed as a getter because `useSyncExternalStore`
 * requires a snapshot that is stable across calls.
 */
let cachedProfile: PerformanceProfile | null = null;

export function currentProfile(): PerformanceProfile {
  cachedProfile ??= profileFromSignals(readSignals());
  return cachedProfile;
}

/** Test seam — lets a suite exercise profiles without faking a device. */
export function resetProfileCache(): void {
  cachedProfile = null;
}
