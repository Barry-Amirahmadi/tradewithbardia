import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { heroScene } from "../lib/viz/scenes/hero-scene";
import type { Annotation } from "../lib/viz/types";

/**
 * The hero diagram teaches a specific setup. If someone edits the segment
 * table and the sweep stops clearing the level, or the retrace fills the gap,
 * the picture still renders — it just quietly teaches something false.
 *
 * These assertions exist so that change fails the build instead.
 */

function find(id: string): Annotation {
  const annotation = heroScene.annotations.find((a) => a.id === id);
  assert.ok(annotation !== undefined, `annotation "${id}" is missing`);
  return annotation;
}

function priceOf(id: string): number {
  const annotation = find(id);
  assert.ok("price" in annotation, `annotation "${id}" has no price`);
  return annotation.price;
}

describe("scene integrity", () => {
  it("is declared synthetic, never verified", () => {
    assert.equal(heroScene.provenance, "synthetic");
    assert.notEqual(
      heroScene.provenance,
      "verified",
      "no scene may claim verified data until a real reconciled sample exists",
    );
  });

  it("has candles with coherent OHLC", () => {
    assert.ok(heroScene.candles.length > 0);
    for (const [index, c] of heroScene.candles.entries()) {
      assert.ok(c.h >= c.l, `candle ${index}: high below low`);
      assert.ok(c.h >= Math.max(c.o, c.c) - 1e-9, `candle ${index}: body above high`);
      assert.ok(c.l <= Math.min(c.o, c.c) + 1e-9, `candle ${index}: body below low`);
    }
  });
});

describe("the setup narrative", () => {
  it("sweep clears the liquidity level by a visible margin", () => {
    const liquidity = priceOf("liquidity-buyside");
    const sweep = priceOf("sweep");
    assert.ok(
      sweep >= liquidity + 1.5,
      `sweep ${sweep} does not clearly take liquidity ${liquidity} — a sweep the eye cannot see is not a sweep`,
    );
  });

  it("the sweep is the highest point in the scene", () => {
    const sweep = priceOf("sweep");
    const highest = Math.max(...heroScene.candles.map((c) => c.h));
    assert.equal(sweep, highest, "something trades above the sweep, so it took nothing");
  });

  it("displacement breaks the swing low, producing a real structure shift", () => {
    const structure = priceOf("mss");
    const fvg = find("fvg");
    assert.ok(fvg.kind === "zone");
    assert.ok(
      structure > fvg.top,
      `price never traded below the swing low ${structure}, so there is no market structure shift`,
    );
  });

  it("a fair value gap actually formed", () => {
    const fvg = find("fvg");
    assert.ok(fvg.kind === "zone");
    assert.ok(fvg.top > fvg.bottom, "gap is inverted");
    assert.ok(
      fvg.top - fvg.bottom > 0.5,
      `gap of ${(fvg.top - fvg.bottom).toFixed(2)} is too thin to read as an imbalance`,
    );
  });

  it("the gap is genuinely unfilled at the moment it forms", () => {
    const fvg = find("fvg");
    assert.ok(fvg.kind === "zone");
    // The three candles spanning the gap must leave it open: the low before
    // and the high after must not overlap.
    const before = heroScene.candles[fvg.fromIndex];
    const after = heroScene.candles[fvg.fromIndex + 2];
    assert.ok(before !== undefined && after !== undefined);
    assert.ok(
      before.l > after.h,
      "the candles around the gap overlap, so no imbalance was left behind",
    );
  });

  it("retracement reaches the gap but does not fill it", () => {
    const fvg = find("fvg");
    assert.ok(fvg.kind === "zone");
    const entry = priceOf("entry");

    // Highest point after the gap forms — the retracement.
    const after = heroScene.candles.slice(fvg.fromIndex + 3);
    const retraceHigh = Math.max(...after.map((c) => c.h));

    assert.ok(
      retraceHigh >= fvg.bottom,
      `retrace high ${retraceHigh} never reached the gap at ${fvg.bottom}`,
    );
    assert.ok(
      retraceHigh <= fvg.top + 0.5,
      `retrace high ${retraceHigh} ran past the gap top ${fvg.top} — the imbalance is filled and the entry is unmotivated`,
    );
    assert.ok(
      entry >= fvg.bottom && entry <= fvg.top,
      `entry ${entry} sits outside its own gap ${fvg.bottom}–${fvg.top}`,
    );
  });
});

describe("execution levels", () => {
  it("is a short: stop above entry, target below", () => {
    const entry = priceOf("entry");
    const stop = priceOf("stop");
    const target = priceOf("target");
    assert.ok(stop > entry, "stop must sit above entry on a short");
    assert.ok(target < entry, "target must sit below entry on a short");
  });

  it("stop sits above the gap it is protecting", () => {
    const fvg = find("fvg");
    assert.ok(fvg.kind === "zone");
    assert.ok(priceOf("stop") >= fvg.top, "stop inside the gap would be hit by the entry itself");
  });

  it("implied R stays in ordinary territory", () => {
    const entry = priceOf("entry");
    const stop = priceOf("stop");
    const target = priceOf("target");
    const r = (entry - target) / (stop - entry);
    // Not a performance claim — a guard that the teaching diagram does not
    // drift into showing an implausible outlier as if it were typical.
    assert.ok(r > 1, `implied R of ${r.toFixed(2)} is not worth illustrating`);
    assert.ok(r < 6, `implied R of ${r.toFixed(2)} reads as a highlight reel, not a process`);
  });

  it("price actually reaches the target within the scene", () => {
    const target = priceOf("target");
    const lowest = Math.min(...heroScene.candles.map((c) => c.l));
    assert.ok(lowest <= target, "the scene ends before the trade resolves");
  });
});
