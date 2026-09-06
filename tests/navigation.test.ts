import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeNavId,
  hrefFor,
  horizontalStep,
  isNavChildActive,
  isNavItemActive,
  navSegments,
  primaryNav,
} from "../lib/navigation";

/**
 * The navigation model is the single source of truth for the bar, the mega
 * menus, the mobile drawer, the footer, the palette and route validation.
 * These assertions are what stop it drifting out of agreement with the router.
 */

describe("navigation model integrity", () => {
  it("has unique ids across the whole tree", () => {
    const ids = primaryNav.flatMap((n) => [
      n.id,
      ...(n.children ?? []).map((c) => c.id),
    ]);
    assert.equal(new Set(ids).size, ids.length, "duplicate id in the nav tree");
  });

  it("has unique top-level segments", () => {
    const segments = primaryNav.map((n) => n.segment);
    assert.equal(new Set(segments).size, segments.length);
  });

  it("exposes only navigable segments for route generation", () => {
    for (const segment of navSegments) {
      const node = primaryNav.find((n) => n.segment === segment);
      assert.ok(node !== undefined);
      assert.notEqual(node.status, "planned");
    }
  });

  it("never yields an href for a planned destination", () => {
    for (const node of primaryNav) {
      for (const child of node.children ?? []) {
        if (child.status !== "planned") continue;
        assert.equal(
          hrefFor("en", child, node),
          null,
          `${child.id} is planned but produced a link — that is a link to a 404`,
        );
      }
    }
  });

  it("builds locale-prefixed hrefs and never bare paths", () => {
    for (const locale of ["fa", "en"] as const) {
      for (const node of primaryNav) {
        const href = hrefFor(locale, node);
        assert.ok(href !== null);
        assert.ok(
          href.startsWith(`/${locale}/`),
          `${node.id} produced "${href}" for locale ${locale}`,
        );
      }
    }
  });
});

describe("active route detection", () => {
  const setups = primaryNav.find((n) => n.id === "setups");

  it("matches the section route in both locales", () => {
    assert.ok(setups !== undefined);
    assert.ok(isNavItemActive("/en/setups", setups));
    assert.ok(isNavItemActive("/fa/setups", setups));
  });

  it("stays active on a nested route", () => {
    assert.ok(setups !== undefined);
    assert.ok(isNavItemActive("/en/setups/unicorn", setups));
    assert.ok(isNavItemActive("/fa/setups/unicorn/replay", setups));
  });

  it("does not match a different section", () => {
    assert.ok(setups !== undefined);
    assert.ok(!isNavItemActive("/en/journal", setups));
    assert.ok(!isNavItemActive("/en", setups));
  });

  it("does not match a section that merely shares a prefix", () => {
    assert.ok(setups !== undefined);
    // The bug a naive startsWith() check would have.
    assert.ok(!isNavItemActive("/en/setups-archive", setups));
  });

  it("resolves the active id, or null on the home route", () => {
    assert.equal(activeNavId("/fa/journal"), "journal");
    // The Learn destination is served at /academy as of EPIC 06; the nav id
    // stays `learn` because that is the label key, not the route.
    assert.equal(activeNavId("/en/academy/liquidity"), "learn");
    assert.equal(activeNavId("/en"), null);
    assert.equal(activeNavId("/"), null);
  });

  it("only marks a child active when both segments match", () => {
    const learn = primaryNav.find((n) => n.id === "learn");
    assert.ok(learn !== undefined);
    const child = learn.children?.[0];
    assert.ok(child !== undefined);
    // Every child is currently planned, so it has no segment and can never be
    // active — asserted so this stays true when segments are added.
    assert.equal(isNavChildActive("/en/academy/academy", learn, child), child.segment !== undefined);
  });
});

describe("direction-aware keyboard stepping", () => {
  it("ArrowRight advances in LTR and retreats in RTL", () => {
    assert.equal(horizontalStep("ArrowRight", "en"), 1);
    assert.equal(horizontalStep("ArrowRight", "fa"), -1);
  });

  it("ArrowLeft retreats in LTR and advances in RTL", () => {
    assert.equal(horizontalStep("ArrowLeft", "en"), -1);
    assert.equal(horizontalStep("ArrowLeft", "fa"), 1);
  });

  it("ignores unrelated keys", () => {
    assert.equal(horizontalStep("Enter", "en"), 0);
    assert.equal(horizontalStep("ArrowDown", "fa"), 0);
  });
});
