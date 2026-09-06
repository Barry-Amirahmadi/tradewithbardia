import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import { pickRenderer } from "../lib/viz/capability";
import { marketTokens } from "../lib/viz/market-tokens";
import { renderBudget } from "../lib/viz/render-profile";
import {
  normalizeProgress,
  resolveSceneState,
  visibleBounds,
} from "../lib/viz/scene-state";
import { heroBeatAt, heroBeats, heroScene } from "../lib/viz/scenes/hero-scene";
import { rendererChain, type PerformanceProfile, type RendererId } from "../lib/viz/types";

/**
 * EPIC 03 — the hero as a pure function of progress.
 *
 * Everything the cinematic sequence does is derived from one number. That is
 * what makes it testable without a browser, and it is also the property that
 * has to hold for §30: scrolling backwards, jumping with a link, restoring a
 * position on reload and resizing are all the same thing to the scene.
 */

const SAMPLES = [0, 0.25, 0.5, 0.75, 1] as const;

describe("hero timeline", () => {
  for (const progress of SAMPLES) {
    it(`resolves a complete state at progress ${progress}`, () => {
      const state = resolveSceneState(heroScene, progress);

      assert.ok(heroBeats.includes(state.stage.id as (typeof heroBeats)[number]));
      assert.ok(state.stageProgress >= 0 && state.stageProgress <= 1);
      assert.ok(Number.isFinite(state.revealed));
      assert.ok(state.revealed >= 0);
      assert.ok(state.revealed <= heroScene.candles.length);

      const bounds = visibleBounds(heroScene, state.revealed);
      assert.ok(Number.isFinite(bounds.min) && Number.isFinite(bounds.max));
      assert.ok(bounds.max > bounds.min, "the camera must have a real range");
    });
  }

  it("is monotonic: candles are never un-revealed by scrolling forward", () => {
    let previous = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { revealed } = resolveSceneState(heroScene, p);
      assert.ok(
        revealed >= previous - 1e-9,
        `revealed fell from ${previous} to ${revealed} at ${p.toFixed(2)}`,
      );
      previous = revealed;
    }
  });

  it("opens on a market, not an empty axis", () => {
    const { revealed } = resolveSceneState(heroScene, 0);
    assert.ok(revealed >= 8, `hero opens with only ${revealed} candles`);
  });

  it("ends with the whole sequence on screen and every annotation lit", () => {
    const end = resolveSceneState(heroScene, 1);
    assert.equal(end.stage.id, "system");
    assert.equal(Math.round(end.revealed), heroScene.candles.length);
    for (const annotation of heroScene.annotations) {
      assert.equal(
        end.opacity.get(annotation.id),
        1,
        `"${annotation.id}" is not fully revealed at the end of the sequence`,
      );
    }
  });

  it("interpolates rather than cutting: 0.32 is a real intermediate state", () => {
    // §16 — a mid-beat position must differ from both of its neighbours, or
    // the sequence is a slideshow wearing a scrubber.
    const a = resolveSceneState(heroScene, 0.30);
    const b = resolveSceneState(heroScene, 0.32);
    const c = resolveSceneState(heroScene, 0.34);
    assert.notEqual(a.revealed, b.revealed);
    assert.notEqual(b.revealed, c.revealed);
  });
});

describe("beat resolution", () => {
  it("names all nine beats in order across the timeline", () => {
    const seen: string[] = [];
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const beat = heroBeatAt(p);
      if (seen[seen.length - 1] !== beat) seen.push(beat);
    }
    assert.deepEqual(seen, [...heroBeats]);
  });

  it("is deterministic — the same progress always names the same beat", () => {
    for (const p of [0, 0.13, 0.37, 0.61, 0.88, 1]) {
      assert.equal(heroBeatAt(p), heroBeatAt(p));
    }
  });

  it("scrolling backwards retraces the same beats", () => {
    // The same sample points in both directions, so this measures
    // direction-independence rather than floating-point accumulation.
    const points = Array.from({ length: 101 }, (_, i) => i / 100);
    const forward = points.map(heroBeatAt);
    const backward = [...points].reverse().map(heroBeatAt).reverse();
    assert.deepEqual(backward, forward);
  });
});

describe("progress boundary conditions", () => {
  it("clamps out-of-range input", () => {
    assert.equal(normalizeProgress(-3), 0);
    assert.equal(normalizeProgress(1.7), 1);
    assert.equal(normalizeProgress(0.42), 0.42);
  });

  it("resolves NaN to the start instead of poisoning the scene", () => {
    // NaN survives every comparison in a naive clamp, and a canvas asked to
    // draw at NaN silently paints nothing — a failure that looks exactly like
    // a renderer that never mounted.
    assert.equal(normalizeProgress(Number.NaN), 0);
  });

  it("clamps infinities in the same direction as any other overshoot", () => {
    assert.equal(normalizeProgress(Number.POSITIVE_INFINITY), 1);
    assert.equal(normalizeProgress(Number.NEGATIVE_INFINITY), 0);
    // Consistency with a merely-large number is the point: a boundary rule
    // that reverses at infinity is impossible to reason about.
    assert.equal(normalizeProgress(1e9), normalizeProgress(Number.POSITIVE_INFINITY));
  });

  it("still resolves a drawable state at every boundary", () => {
    for (const bad of [-5, 0, 1, 9, Number.NaN]) {
      const state = resolveSceneState(heroScene, bad);
      assert.ok(Number.isFinite(state.revealed), `revealed is NaN at ${bad}`);
      const bounds = visibleBounds(heroScene, state.revealed);
      assert.ok(Number.isFinite(bounds.min) && bounds.max > bounds.min);
    }
  });

  it("survives rapid direction changes without drifting", () => {
    // The scene keeps no history, so a thrashing scrub must land in exactly
    // the same place as arriving at that position directly.
    const jitter = [0.5, 0.1, 0.9, 0.2, 0.8, 0.42];
    let last = resolveSceneState(heroScene, 0);
    for (const p of jitter) last = resolveSceneState(heroScene, p);
    const direct = resolveSceneState(heroScene, 0.42);
    assert.equal(last.revealed, direct.revealed);
    assert.equal(last.stage.id, direct.stage.id);
  });
});

describe("performance modes change complexity", () => {
  const profiles: readonly PerformanceProfile[] = ["high", "medium", "low"];

  it("each profile produces a distinct budget", () => {
    const seen = new Set(profiles.map((p) => JSON.stringify(renderBudget(p))));
    assert.equal(seen.size, profiles.length, "a profile that changes nothing is not a profile");
  });

  it("cost falls monotonically from high to low", () => {
    const [high, medium, low] = profiles.map((p) => renderBudget(p));
    assert.ok(high !== undefined && medium !== undefined && low !== undefined);
    assert.ok(high.noisePoints > medium.noisePoints);
    assert.ok(medium.noisePoints > low.noisePoints);
    assert.ok(high.maxDpr >= medium.maxDpr);
    assert.ok(medium.maxDpr > low.maxDpr);
    // A faster camera settles sooner, so it draws fewer frames after scrolling
    // stops — the easing factor rises as the budget falls.
    assert.ok(low.cameraEasing > medium.cameraEasing);
    assert.ok(medium.cameraEasing > high.cameraEasing);
  });

  it("low never degrades to a blank chart", () => {
    // §14 — atmosphere goes, the story does not.
    const low = renderBudget("low");
    assert.equal(low.atmosphere, false, "the ambient layer is the first thing to go");
    assert.equal(low.tags, true, "annotation labels are the story, not decoration");
    assert.equal(low.wicks, true);
    assert.ok(low.gridLines >= 3);
  });

  it("compact reduces density without changing capability", () => {
    for (const profile of profiles) {
      const roomy = renderBudget(profile, false);
      const compact = renderBudget(profile, true);
      assert.ok(compact.noisePoints <= roomy.noisePoints);
      assert.ok(compact.gridLines <= roomy.gridLines);
      assert.ok(compact.maxDpr <= roomy.maxDpr);
      assert.equal(compact.tags, roomy.tags, "density must not silence the labels");
    }
  });
});

describe("renderer selection stays abstract", () => {
  const phase0 = new Set<RendererId>(["canvas", "static"]);

  it("reduced motion resolves to the static tier on every profile", () => {
    for (const profile of ["high", "medium", "low"] as const) {
      assert.equal(
        pickRenderer(profile, new Set<RendererId>(rendererChain), [], true),
        "static",
        `${profile} + reduced motion must not reach an animated renderer`,
      );
    }
  });

  it("reduced motion outranks capability, not the other way round", () => {
    assert.equal(pickRenderer("high", phase0, [], false), "canvas");
    assert.equal(pickRenderer("high", phase0, [], true), "static");
  });

  it("the hero never has to name a renderer to get one", () => {
    // Every reachable combination resolves to something registered, so the
    // caller can always render what it is handed (§10).
    for (const profile of ["high", "medium", "low"] as const) {
      for (const reduced of [false, true]) {
        const id = pickRenderer(profile, phase0, [], reduced);
        assert.ok(phase0.has(id), `${profile}/${reduced} resolved to "${id}"`);
      }
    }
  });
});

describe("locale does not alter scene semantics", () => {
  it("both languages carry copy for all nine beats", () => {
    for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
      for (const beat of heroBeats) {
        const stage = dict.hero.stages[beat];
        assert.ok(stage !== undefined, `${name} is missing the "${beat}" beat`);
        assert.ok(stage.label.length > 0, `${name}.${beat} has no label`);
        assert.ok(stage.caption.length > 0, `${name}.${beat} has no caption`);
      }
    }
  });

  it("Persian hero copy contains no parentheses", () => {
    // House rule: parentheses break RTL rendering in this product.
    const values = JSON.stringify(fa.hero);
    assert.ok(!values.includes("("), "Persian hero copy must not use parentheses");
    assert.ok(!values.includes(")"));
  });

  it("the scene itself is language-free", () => {
    // Nothing in the scene may carry prose: the renderers draw it, and a
    // renderer cannot translate. Labels live in the dictionary beside the
    // figure, where a screen reader can reach them.
    const serialised = JSON.stringify(heroScene);
    for (const word of Object.values(en.hero.stages).map((s) => s.caption)) {
      assert.ok(!serialised.includes(word));
    }
  });
});

describe("both themes resolve valid visual states", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  it("every role in the shared vocabulary is declared", () => {
    for (const token of Object.values(marketTokens)) {
      assert.ok(
        css.includes(`${token}:`),
        `${token} is used by the renderers but never declared`,
      );
    }
  });

  it("every role resolves per theme rather than being frozen to one", () => {
    // A market colour declared as a bare literal would render the same in both
    // themes. It is allowed to alias another token, but the chain has to end
    // in a light-dark() somewhere — which is what the theme toggle drives.
    for (const token of Object.values(marketTokens)) {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
      assert.ok(declaration !== null, `${token} has no declaration`);
      const value = declaration[1] ?? "";
      assert.ok(
        value.includes("light-dark(") || value.includes("var(--"),
        `${token} is "${value}" — a fixed value cannot follow the theme`,
      );
    }
  });
});
