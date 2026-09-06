import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DELTA_THRESHOLD,
  HIDE_AFTER,
  TOP_THRESHOLD,
  isCondensed,
  nextNavState,
  type NavState,
} from "../lib/nav-state";

/**
 * The navbar's scroll behaviour. These are the rules that make a hiding navbar
 * feel deliberate rather than broken, and every one of them is a sign or a
 * threshold that is easy to get backwards.
 */

const at = (
  y: number,
  delta: number,
  current: NavState = "scrolled",
  menuOpen = false,
) => nextNavState({ y, delta, current, menuOpen });

describe("navigation state machine", () => {
  it("is transparent at the top of the page", () => {
    assert.equal(at(0, 0, "initial"), "initial");
    assert.equal(at(TOP_THRESHOLD - 1, 5, "scrolled"), "initial");
  });

  it("condenses once past the top, even without a decisive direction", () => {
    assert.equal(at(TOP_THRESHOLD + 1, 0, "initial"), "scrolled");
  });

  it("hides on a deliberate downward scroll, once deep enough", () => {
    assert.equal(at(HIDE_AFTER + 10, DELTA_THRESHOLD + 1), "hidden");
  });

  it("does NOT hide near the top, however fast the scroll", () => {
    assert.equal(at(HIDE_AFTER - 10, 100), "scrolled");
  });

  it("returns immediately on an upward scroll", () => {
    assert.equal(at(2000, -(DELTA_THRESHOLD + 1), "hidden"), "scrolled");
  });

  it("ignores sub-threshold jitter and holds its state", () => {
    assert.equal(at(2000, 1, "hidden"), "hidden");
    assert.equal(at(2000, -1, "hidden"), "hidden");
    assert.equal(at(2000, 0, "scrolled"), "scrolled");
  });

  it("an open menu pins the bar regardless of scrolling", () => {
    assert.equal(at(5000, 100, "hidden", true), "menu-open");
    assert.equal(at(0, -100, "initial", true), "menu-open");
  });

  it("leaves menu-open for a real state once the menu closes", () => {
    assert.equal(at(2000, 0, "menu-open", false), "scrolled");
  });

  it("never returns menu-open when the menu is closed", () => {
    for (let y = 0; y <= 3000; y += 250) {
      for (const delta of [-50, -5, -1, 0, 1, 5, 50]) {
        for (const current of ["initial", "scrolled", "hidden", "menu-open"] as const) {
          assert.notEqual(at(y, delta, current, false), "menu-open");
        }
      }
    }
  });

  it("only `initial` is uncondensed", () => {
    assert.equal(isCondensed("initial"), false);
    assert.equal(isCondensed("scrolled"), true);
    assert.equal(isCondensed("hidden"), true);
    assert.equal(isCondensed("menu-open"), true);
  });
});
