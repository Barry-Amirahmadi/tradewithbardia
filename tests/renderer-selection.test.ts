import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickRenderer, profileFromSignals, type DeviceSignals } from "../lib/viz/capability";
import { rendererChain, type RendererId } from "../lib/viz/types";

/**
 * Renderer selection and the §50 fallback chain.
 *
 * These are pure functions on purpose: the decision about which renderer a
 * device gets should be testable without a device.
 */

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    reducedMotion: false,
    deviceMemory: 8,
    cores: 8,
    saveData: false,
    effectiveType: "4g",
    coarsePointer: false,
    viewportWidth: 1440,
    webgl: true,
    ...overrides,
  };
}

const all = new Set<RendererId>(rendererChain);
const phase0 = new Set<RendererId>(["canvas", "static"]);

describe("performance profile", () => {
  it("a capable desktop reaches high", () => {
    assert.equal(profileFromSignals(signals()), "high");
  });

  it("reduced motion outranks every capability signal", () => {
    assert.equal(
      profileFromSignals(signals({ reducedMotion: true, deviceMemory: 32, cores: 16 })),
      "low",
      "a stated preference must beat a hardware guess",
    );
  });

  it("save-data and 2g drop to low", () => {
    assert.equal(profileFromSignals(signals({ saveData: true })), "low");
    assert.equal(profileFromSignals(signals({ effectiveType: "2g" })), "low");
  });

  it("weak hardware drops to low", () => {
    assert.equal(profileFromSignals(signals({ deviceMemory: 2 })), "low");
    assert.equal(profileFromSignals(signals({ cores: 2 })), "low");
  });

  it("no WebGL means medium, not low — canvas is still fine", () => {
    assert.equal(profileFromSignals(signals({ webgl: false })), "medium");
  });

  it("a mid phone lands on medium", () => {
    assert.equal(
      profileFromSignals(signals({ deviceMemory: 4, coarsePointer: true, viewportWidth: 390 })),
      "medium",
    );
  });
});

describe("renderer selection", () => {
  it("high picks the strongest registered renderer", () => {
    assert.equal(pickRenderer("high", all), "webgl");
  });

  it("medium never reaches webgl", () => {
    assert.equal(pickRenderer("medium", all), "frames");
  });

  it("low reaches neither webgl nor frames", () => {
    assert.equal(pickRenderer("low", all), "canvas");
  });

  it("falls through to what is actually registered", () => {
    // Phase 0 registers canvas + static only, so every profile resolves to
    // canvas. This is the seam working, not a stub.
    for (const profile of ["high", "medium", "low"] as const) {
      assert.equal(pickRenderer(profile, phase0), "canvas");
    }
  });

  it("static is the floor when nothing else is registered", () => {
    assert.equal(pickRenderer("high", new Set<RendererId>(["static"])), "static");
    assert.equal(pickRenderer("high", new Set<RendererId>()), "static");
  });
});

describe("failure walks the chain, it does not collapse", () => {
  it("a dead webgl context lands on frames, not on a static image", () => {
    assert.equal(pickRenderer("high", all, ["webgl"]), "frames");
  });

  it("successive failures keep descending", () => {
    assert.equal(pickRenderer("high", all, ["webgl", "frames"]), "video");
    assert.equal(pickRenderer("high", all, ["webgl", "frames", "video"]), "canvas");
    assert.equal(pickRenderer("high", all, ["webgl", "frames", "video", "canvas"]), "static");
  });

  it("a failed canvas in Phase 0 falls back to static", () => {
    assert.equal(pickRenderer("high", phase0, ["canvas"]), "static");
  });
});

describe("the chain itself", () => {
  it("is ordered strongest to weakest and ends at static", () => {
    assert.equal(rendererChain[0], "webgl");
    assert.equal(rendererChain[rendererChain.length - 1], "static");
  });

  it("has no duplicates", () => {
    assert.equal(new Set(rendererChain).size, rendererChain.length);
  });
});
