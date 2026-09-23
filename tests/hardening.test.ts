import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import { journalLab } from "../lib/journal/lab-view";
import { profileFromSignals, type DeviceSignals } from "../lib/viz/capability";

/**
 * EPIC 10 hardening guards.
 *
 * Each test here exists because a measurement found a real defect. None of
 * them assert style; they assert the property that measurement established,
 * so the fix cannot silently rot back.
 */

describe("journal payload projection (§16)", () => {
  const lab = en.lab;

  it("carries setup titles and nothing else from the specification", () => {
    const projected = journalLab(lab);
    for (const [slug, item] of Object.entries(projected.items)) {
      assert.deepEqual(
        Object.keys(item),
        ["title"],
        `${slug} must expose only its title to the journal`,
      );
      assert.equal(item.title, lab.items[slug as keyof typeof lab.items].title);
    }
  });

  it("drops the specification prose that was being serialized into /app/*", () => {
    // The EPIC 09 build shipped all of this into all twelve app routes:
    // 7,887 bytes raw / 2,921 gzipped each, for text the app never renders.
    const serialized = JSON.stringify(journalLab(lab));
    const prose = lab.items["liquidity-sweep-reversal"];
    for (const field of ["purpose", "context", "trigger", "invalidation", "review"] as const) {
      assert.ok(
        !serialized.includes(prose[field]),
        `journal payload must not carry setup ${field} prose`,
      );
    }
    assert.ok(
      serialized.length < JSON.stringify(lab).length / 4,
      "the projection must be a small fraction of the full lab dictionary",
    );
  });

  it("keeps the enum label maps the application does render", () => {
    const projected = journalLab(lab);
    assert.deepEqual(Object.keys(projected.instruments), Object.keys(lab.instruments));
    assert.deepEqual(Object.keys(projected.sessions), Object.keys(lab.sessions));
    assert.deepEqual(Object.keys(projected.timeframes), Object.keys(lab.timeframes));
  });
});

describe("capability signals (§21)", () => {
  const base: DeviceSignals = {
    reducedMotion: false,
    deviceMemory: 8,
    cores: 8,
    saveData: false,
    effectiveType: "4g",
    coarsePointer: false,
    viewportWidth: 1440,
  };

  it("a stated motion preference still outranks every hardware signal", () => {
    assert.equal(profileFromSignals({ ...base, reducedMotion: true }), "low");
  });

  it("a small coarse-pointer viewport still resolves to medium", () => {
    assert.equal(
      profileFromSignals({ ...base, coarsePointer: true, viewportWidth: 390, deviceMemory: 4 }),
      "medium",
    );
  });
});
