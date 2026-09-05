import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MIN_SLOTS, resolveSceneState, slotCount, visibleBounds } from "../lib/viz/scene-state";
import { heroScene } from "../lib/viz/scenes/hero-scene";
import type { TradingScene } from "../lib/viz/types";

/**
 * Progress → state resolution. These invariants are what let the canvas
 * renderer and the server-rendered SVG be trusted to agree: both call
 * `resolveSceneState`, so anything true here is true of both.
 */

const scenes: readonly TradingScene[] = [heroScene];

describe("stage continuity", () => {
  for (const scene of scenes) {
    it(`${scene.id}: stages tile 0..1 with no gaps or overlaps`, () => {
      let cursor = 0;
      for (const stage of scene.stages) {
        assert.equal(
          stage.start,
          cursor,
          `stage "${stage.id}" starts at ${stage.start}, expected ${cursor}`,
        );
        assert.ok(stage.end > stage.start, `stage "${stage.id}" is empty`);
        cursor = stage.end;
      }
      assert.equal(cursor, 1, "stages must end at exactly 1");
    });

    it(`${scene.id}: revealTo never decreases between stages`, () => {
      let previous = scene.initialReveal ?? 0;
      for (const stage of scene.stages) {
        assert.ok(
          stage.revealTo >= previous,
          `stage "${stage.id}" reveals ${stage.revealTo} after ${previous}`,
        );
        previous = stage.revealTo;
      }
    });

    it(`${scene.id}: the final stage reveals every candle`, () => {
      const last = scene.stages[scene.stages.length - 1];
      assert.ok(last !== undefined);
      assert.equal(last.revealTo, scene.candles.length);
    });
  }
});

describe("reveal monotonicity", () => {
  it("revealed count never goes backwards across the whole scroll", () => {
    let previous = -Infinity;
    for (let step = 0; step <= 1000; step += 1) {
      const progress = step / 1000;
      const { revealed } = resolveSceneState(heroScene, progress);
      assert.ok(
        revealed >= previous - 1e-9,
        `revealed dropped from ${previous} to ${revealed} at p=${progress}`,
      );
      previous = revealed;
    }
  });

  it("opens with the scene's initialReveal, not an empty chart", () => {
    const { revealed } = resolveSceneState(heroScene, 0);
    assert.equal(revealed, heroScene.initialReveal);
    assert.ok(revealed > 0, "a hero that opens empty says nothing");
  });

  it("ends with every candle revealed", () => {
    const { revealed } = resolveSceneState(heroScene, 1);
    assert.equal(Math.round(revealed), heroScene.candles.length);
  });
});

describe("progress clamping", () => {
  it("clamps out-of-range progress instead of extrapolating", () => {
    const under = resolveSceneState(heroScene, -5);
    const over = resolveSceneState(heroScene, 5);
    assert.equal(under.revealed, resolveSceneState(heroScene, 0).revealed);
    assert.equal(over.revealed, resolveSceneState(heroScene, 1).revealed);
  });
});

describe("annotation opacity", () => {
  it("every annotation is revealed by some stage", () => {
    const declared = new Set(heroScene.annotations.map((a) => a.id));
    const revealed = new Set(heroScene.stages.flatMap((s) => [...s.reveals]));
    for (const id of declared) {
      assert.ok(revealed.has(id), `annotation "${id}" is never revealed`);
    }
  });

  it("no stage reveals an annotation that does not exist", () => {
    const declared = new Set(heroScene.annotations.map((a) => a.id));
    for (const stage of heroScene.stages) {
      for (const id of stage.reveals) {
        assert.ok(declared.has(id), `stage "${stage.id}" reveals unknown "${id}"`);
      }
    }
  });

  it("all annotations are fully opaque at the end", () => {
    const { opacity } = resolveSceneState(heroScene, 1);
    for (const annotation of heroScene.annotations) {
      assert.equal(opacity.get(annotation.id), 1, `"${annotation.id}" not fully revealed`);
    }
  });

  it("an annotation stays visible once revealed", () => {
    const target = "sweep";
    let seen = false;
    for (let step = 0; step <= 500; step += 1) {
      const progress = step / 500;
      const value = resolveSceneState(heroScene, progress).opacity.get(target) ?? 0;
      if (value > 0.99) seen = true;
      if (seen) {
        assert.ok(value > 0.99, `"${target}" faded back out at p=${progress}`);
      }
    }
    assert.ok(seen, `"${target}" never became visible`);
  });
});

describe("camera framing", () => {
  it("bounds always contain the revealed candles", () => {
    for (let step = 0; step <= 200; step += 1) {
      const progress = step / 200;
      const { revealed } = resolveSceneState(heroScene, progress);
      const bounds = visibleBounds(heroScene, revealed);
      const count = Math.max(2, Math.ceil(revealed));
      for (let i = 0; i < count && i < heroScene.candles.length; i += 1) {
        const candle = heroScene.candles[i];
        if (candle === undefined) continue;
        assert.ok(candle.h <= bounds.max, `candle ${i} high above frame at p=${progress}`);
        assert.ok(candle.l >= bounds.min, `candle ${i} low below frame at p=${progress}`);
      }
    }
  });

  it("slot count never drops below the floor, so few candles are not stretched absurdly", () => {
    assert.equal(slotCount(1), MIN_SLOTS);
    assert.equal(slotCount(MIN_SLOTS + 7), MIN_SLOTS + 7);
  });
});
