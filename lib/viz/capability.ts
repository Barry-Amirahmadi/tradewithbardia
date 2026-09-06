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
  webgl: boolean;
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
    webgl: detectWebGL(),
  };
}

/**
 * Probe by creating and immediately discarding a context. Cheap, and far more
 * honest than a user-agent sniff — a browser can advertise WebGL and still
 * fail to allocate one under memory pressure or a blocklisted driver.
 */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (gl === null) return false;
    const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

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

  if (!signals.webgl) return "medium";
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
