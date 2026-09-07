import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import { insights, MIN_INSIGHT, performance, storageMode } from "../lib/journal/analytics";
import { outcome, realisedPnl } from "../lib/journal/calculations";
import { demoTrades } from "../lib/journal/demo-data";
import {
  draftFromTrade,
  draftTimeToIso,
  emptyDraft,
  isoToDraftTime,
  newTradeId,
  parseDecimal,
  parseDraft,
  requiredDraftFields,
  type TradeDraft,
} from "../lib/journal/draft";
import { parseFragment, serializeFragment } from "../lib/journal/fragment";
import { migrate, migrateJson, serializeStorage, STORAGE_VERSION } from "../lib/journal/migration";
import { toMoney, toPrice } from "../lib/journal/money";
import { MemoryTradeRepository } from "../lib/journal/repository";
import {
  issueCodes,
  reviewState,
  validateTrade,
  type IssueCode,
  type StoredTrade,
} from "../lib/journal/trade";
import { resolveAppScreen, appScreenSegments, appViews } from "../lib/journal/views";

/**
 * EPIC 09 — TRADE CAPTURE & REVIEW INTELLIGENCE.
 *
 * The tests EPIC 09 §43–§46 asks for, plus the ones the implementation
 * suggested. They run against the domain directly, with no DOM and no test
 * framework beyond Node's own runner.
 */

/** A draft that parses cleanly, as the starting point for negative cases. */
function goodDraft(overrides: Partial<TradeDraft> = {}): TradeDraft {
  return {
    ...emptyDraft(new Date("2026-09-01T10:00:00Z")),
    status: "closed",
    instrument: "forex",
    direction: "long",
    session: "london",
    timeframe: "h1",
    setupId: "equal-highs-draw",
    conceptIds: ["liquidity", "equalHighs"],
    entry: "1.0842",
    stop: "1.0808",
    target: "1.0925",
    exit: "1.0921",
    riskAmount: "250",
    openedAt: "2026-09-01T10:00",
    closedAt: "2026-09-01T14:30",
    notes: "",
    ...overrides,
  };
}

const META = { id: "t1", origin: "user" } as const;

describe("strict number parsing (§9)", () => {
  it("accepts plain decimals", () => {
    assert.equal(parseDecimal("1.0842"), 1.0842);
    assert.equal(parseDecimal("  250 "), 250);
    assert.equal(parseDecimal("-3"), -3);
  });

  it("refuses the values a naive Number() would silently accept", () => {
    // Every one of these becomes 0 or NaN under `Number`, and would end up
    // stored as a plausible-looking price.
    for (const raw of ["", "   ", "abc", "1,5", "1.2.3", "+5", "0x10", "Infinity"]) {
      assert.equal(parseDecimal(raw), null, `should reject ${JSON.stringify(raw)}`);
    }
  });

  it("refuses exponent notation, which is far likelier a typo than intent", () => {
    assert.equal(parseDecimal("1e5"), null);
  });
});

describe("timestamps (§31)", () => {
  it("reads wall-clock input as UTC so the round-trip is lossless", () => {
    assert.equal(draftTimeToIso("2026-09-07T14:30"), "2026-09-07T14:30:00.000Z");
    assert.equal(isoToDraftTime("2026-09-07T14:30:00.000Z"), "2026-09-07T14:30");
  });

  it("round-trips any entered time regardless of the machine's timezone", () => {
    const entered = "2026-03-15T09:05";
    const iso = draftTimeToIso(entered);
    assert.notEqual(iso, null);
    assert.equal(isoToDraftTime(iso as string), entered);
  });

  it("rejects an impossible calendar date rather than rolling it forward", () => {
    // `Date.UTC(2026, 1, 30)` silently becomes 2 March.
    assert.equal(draftTimeToIso("2026-02-30T10:00"), null);
    assert.equal(draftTimeToIso("2026-13-01T10:00"), null);
    assert.equal(draftTimeToIso("nonsense"), null);
  });
});

describe("trade creation (§43)", () => {
  it("parses a valid draft into integer domain values", () => {
    const result = parseDraft(goodDraft(), META);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.trade.entry, toPrice(1.0842));
    assert.equal(result.trade.riskAmount, toMoney(250));
    assert.equal(result.trade.origin, "user");
    assert.equal(result.trade.openedAt, "2026-09-01T10:00:00.000Z");
    // Integers, not floats — the whole precision argument in one assertion.
    assert.ok(Number.isInteger(result.trade.entry));
    assert.ok(Number.isInteger(result.trade.riskAmount));
  });

  it("reports every missing required field at once, not just the first", () => {
    const empty = { ...emptyDraft(), instrument: "forex", direction: "long" } as TradeDraft;
    const result = parseDraft(empty, META);
    assert.equal(result.ok, false);
    if (result.ok) return;

    const missing = result.issues.filter((i) => i.code === "required").map((i) => i.field);
    for (const field of ["entry", "stop", "riskAmount"]) {
      assert.ok(missing.includes(field), `expected ${field} to be reported required`);
    }
    assert.ok(missing.length >= 3, "a form that reveals one error at a time is abandoned");
  });

  it("refuses a stop on the wrong side of entry", () => {
    const result = parseDraft(goodDraft({ direction: "long", stop: "1.0900" }), META);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some((i) => i.code === "longStopBelowEntry"));
  });

  it("refuses a target on the wrong side of entry", () => {
    const result = parseDraft(goodDraft({ direction: "long", target: "1.0700" }), META);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some((i) => i.code === "longTargetAboveEntry"));
  });

  it("refuses a closed trade with no exit, and an exit on a trade that is not closed", () => {
    const noExit = parseDraft(goodDraft({ exit: "" }), META);
    assert.equal(noExit.ok, false);
    if (!noExit.ok) assert.ok(noExit.issues.some((i) => i.code === "closedNeedsExit"));

    // Switching status away from closed must also clear the exit; the domain
    // rejects the combination so the form cannot leave it behind.
    const stillOpen = parseDraft(goodDraft({ status: "open", closedAt: "" }), META);
    assert.equal(stillOpen.ok, false);
    if (!stillOpen.ok) assert.ok(stillOpen.issues.some((i) => i.code === "exitOnlyWhenClosed"));
  });

  it("refuses a trade that closes before it opened", () => {
    const result = parseDraft(goodDraft({ closedAt: "2026-08-30T10:00" }), META);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some((i) => i.code === "closedBeforeOpened"));
  });

  it("refuses malformed numbers instead of coercing them to zero", () => {
    const result = parseDraft(goodDraft({ entry: "1,0842", riskAmount: "lots" }), META);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(
      result.issues.filter((i) => i.code === "notANumber").map((i) => i.field).sort(),
      ["entry", "riskAmount"],
    );
  });

  it("refuses a setup or concept that is not canonical (§13, §14)", () => {
    const badSetup = parseDraft(goodDraft({ setupId: "invented-setup" }), META);
    assert.equal(badSetup.ok, false);
    if (!badSetup.ok) assert.ok(badSetup.issues.some((i) => i.code === "unknownSetup"));

    const badConcept = parseDraft(
      goodDraft({ conceptIds: ["liquidity", "not-a-concept"] as never }),
      META,
    );
    assert.equal(badConcept.ok, false);
    if (!badConcept.ok) assert.ok(badConcept.issues.some((i) => i.code === "unknownConcept"));
  });

  it("stores concept ids, never display strings (§14)", () => {
    const result = parseDraft(goodDraft(), META);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual([...result.trade.conceptIds], ["liquidity", "equalHighs"]);
  });

  it("omits optional fields rather than storing empty strings", () => {
    const result = parseDraft(
      goodDraft({ session: "", timeframe: "", setupId: "", target: "", notes: "   " }),
      META,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const key of ["session", "timeframe", "setupId", "target", "notes"] as const) {
      assert.equal(key in result.trade, false, `${key} should be absent, not empty`);
    }
  });

  it("generates unique ids for trades captured in the same millisecond", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    let n = 0;
    const ids = new Set(
      Array.from({ length: 50 }, () => newTradeId(now, () => (n = (n + 0.019) % 1))),
    );
    assert.ok(ids.size > 40, "id suffix must actually vary");
  });
});

describe("trade editing (§6, §43)", () => {
  it("round-trips a stored trade through the form without changing it", () => {
    for (const trade of demoTrades) {
      const back = parseDraft(draftFromTrade(trade), {
        id: trade.id,
        origin: trade.origin,
        ...(trade.review !== undefined ? { review: trade.review } : {}),
      });
      assert.equal(back.ok, true, `${trade.id} should survive a form round-trip`);
      if (!back.ok) continue;
      // The values that carry money must be identical, not merely close.
      assert.equal(back.trade.entry, trade.entry, trade.id);
      assert.equal(back.trade.stop, trade.stop, trade.id);
      assert.equal(back.trade.exit, trade.exit, trade.id);
      assert.equal(back.trade.riskAmount, trade.riskAmount, trade.id);
      assert.equal(back.trade.openedAt, trade.openedAt, trade.id);
    }
  });

  it("preserves the review when the trade's prices are edited (§20)", () => {
    const original = demoTrades.find((t) => t.review !== undefined);
    assert.ok(original !== undefined);
    const edited = parseDraft(draftFromTrade(original), {
      id: original.id,
      origin: original.origin,
      review: original.review,
    });
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.deepEqual(edited.trade.review, original.review);
  });

  it("holds an edited trade to exactly the rules a created one faces", () => {
    const broken = draftFromTrade(demoTrades[0] as StoredTrade);
    const result = parseDraft({ ...broken, stop: broken.entry }, META);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some((i) => i.code === "stopEqualsEntry"));
  });

  it("cannot change a demo record's origin through an update", async () => {
    const repository = new MemoryTradeRepository(demoTrades);
    const updated = await repository.update("demo-01", {
      ...(demoTrades[0] as StoredTrade),
      origin: "user",
    } as never);
    assert.equal(updated?.origin, "demo");
  });
});

describe("review lifecycle (§19, §20)", () => {
  const base = demoTrades[0] as StoredTrade;

  it("has three states and never infers completion", () => {
    assert.equal(reviewState({ ...base, review: undefined }), "notReviewed");
    assert.equal(reviewState(base), "reviewed");
    assert.equal(
      reviewState({ ...base, review: { ...base.review!, complete: false } }),
      "inReview",
    );
  });

  it("treats an EPIC 08 review with no `complete` field as complete", () => {
    // The migration guarantee: absent means complete, so nothing written
    // before EPIC 09 changes meaning.
    assert.equal("complete" in (base.review ?? {}), false);
    assert.equal(reviewState(base), "reviewed");
  });

  it("keeps a draft review out of the reviewed count", async () => {
    const repository = new MemoryTradeRepository(demoTrades);
    const before = performance(await repository.list());
    const target = (await repository.list()).find((t) => t.review === undefined);
    assert.ok(target !== undefined);

    await repository.update(target.id, {
      review: { rules: [], conceptIds: [], reviewedAt: "2026-09-07T00:00:00.000Z", complete: false },
    });
    const after = await repository.list();
    assert.equal(reviewState(after.find((t) => t.id === target.id)!), "inReview");
    // A draft is not an outcome, so performance is untouched.
    assert.deepEqual(performance(after).sample, before.sample);
  });

  it("persists a completed review and can revise it afterwards", async () => {
    const repository = new MemoryTradeRepository(demoTrades);
    const id = "demo-01";
    await repository.update(id, {
      review: {
        rules: [{ id: "risk", adherence: "violated" }],
        conceptIds: ["risk"],
        lessons: "Sized up after two wins.",
        reviewedAt: "2026-09-07T00:00:00.000Z",
      },
    });
    const revised = await repository.get(id);
    assert.equal(revised?.review?.rules[0]?.adherence, "violated");
    assert.equal(revised?.review?.lessons, "Sized up after two wins.");
    assert.equal(reviewState(revised!), "reviewed");
  });

  it("rejects a review tagged with a concept that does not exist", () => {
    const issues = validateTrade({
      ...base,
      review: { ...base.review!, conceptIds: ["fabricated"] as never },
    });
    assert.ok(issues.some((i) => i.code === "unknownConcept"));
  });
});

describe("analytics react to the source data (§21, §44)", () => {
  async function seeded() {
    return new MemoryTradeRepository(demoTrades);
  }

  const winner: StoredTrade = {
    id: "t-win", origin: "user", status: "closed",
    instrument: "forex", direction: "long",
    conceptIds: [], entry: toPrice(1.1), stop: toPrice(1.09), target: toPrice(1.13),
    exit: toPrice(1.13), riskAmount: toMoney(100),
    openedAt: "2026-09-01T10:00:00.000Z", closedAt: "2026-09-01T12:00:00.000Z",
  };

  it("adding a winning trade moves the sample, net P&L and win count", async () => {
    const repository = await seeded();
    const before = performance(await repository.list());
    await repository.create(winner);
    const after = performance(await repository.list());

    assert.equal(after.sample, before.sample + 1);
    assert.equal(after.wins, before.wins + 1);
    assert.ok((after.netPnl ?? 0) > (before.netPnl ?? 0));
  });

  it("adding a losing trade moves the loss count the other way", async () => {
    const repository = await seeded();
    const before = performance(await repository.list());
    await repository.create({ ...winner, id: "t-loss", exit: toPrice(1.09) });
    const after = performance(await repository.list());

    assert.equal(after.losses, before.losses + 1);
    assert.ok((after.netPnl ?? 0) < (before.netPnl ?? 0));
  });

  it("editing a trade's exit changes its outcome and the totals", async () => {
    const repository = await seeded();
    await repository.create(winner);
    const before = performance(await repository.list());

    await repository.update("t-win", { exit: toPrice(1.09) });
    const changed = await repository.get("t-win");
    assert.equal(outcome(changed!), "loss");

    const after = performance(await repository.list());
    assert.equal(after.wins, before.wins - 1);
    assert.equal(after.losses, before.losses + 1);
  });

  it("deleting a trade removes its contribution entirely", async () => {
    const repository = await seeded();
    const before = performance(await repository.list());
    await repository.create(winner);
    await repository.remove("t-win");
    const after = performance(await repository.list());

    assert.deepEqual(
      { sample: after.sample, wins: after.wins, netPnl: after.netPnl },
      { sample: before.sample, wins: before.wins, netPnl: before.netPnl },
    );
  });

  it("a deleted trade's P&L is exactly the difference it made", async () => {
    const repository = await seeded();
    const before = performance(await repository.list()).netPnl ?? 0;
    await repository.create(winner);
    const withIt = performance(await repository.list()).netPnl ?? 0;
    // Integer arithmetic: the difference is exact, not approximately equal.
    assert.equal(withIt - before, realisedPnl(winner));
  });

  it("hides win rate and expectancy below the minimum sample", () => {
    const few = demoTrades.filter((t) => t.status === "closed").slice(0, 3);
    const summary = performance(few);
    assert.equal(summary.winRate, null);
    assert.equal(summary.expectancy, null);
    // But the things that are simply counts remain available.
    assert.notEqual(summary.netPnl, null);
    assert.equal(summary.sample, few.length);
  });
});

describe("review intelligence (§22, §23)", () => {
  it("says nothing at all when there is nothing to say", () => {
    assert.deepEqual(insights(demoTrades.slice(0, 2)), []);
  });

  it("never reports a leader that is tied with the runner-up", () => {
    // Two setups, two trades each: "most traded" would be an arbitrary pick.
    const tied: StoredTrade[] = ["a", "b", "c", "d", "e"].map((suffix, index) => ({
      id: `tie-${suffix}`, origin: "user", status: "planned",
      instrument: "forex", direction: "long", conceptIds: [],
      setupId: index % 2 === 0 ? "equal-highs-draw" : "range-to-expansion",
      entry: toPrice(1.1), stop: toPrice(1.09), riskAmount: toMoney(100),
      openedAt: "2026-09-01T10:00:00.000Z",
    }));
    // Make it an exact 2-2 tie by dropping the odd one out.
    const even = tied.slice(0, 4);
    assert.equal(insights(even).some((i) => i.kind === "topSetup"), false);
  });

  it("reports a leader once it is both large enough and distinguishable", () => {
    const rows: StoredTrade[] = Array.from({ length: MIN_INSIGHT + 1 }, (_, index) => ({
      id: `lead-${index}`, origin: "user", status: "planned",
      instrument: "forex", direction: "long", conceptIds: [],
      setupId: index === 0 ? "range-to-expansion" : "equal-highs-draw",
      entry: toPrice(1.1), stop: toPrice(1.09), riskAmount: toMoney(100),
      openedAt: "2026-09-01T10:00:00.000Z",
    }));
    const found = insights(rows).find((i) => i.kind === "topSetup");
    assert.ok(found !== undefined);
    assert.equal(found.subjectId, "equal-highs-draw");
    assert.equal(found.count, MIN_INSIGHT);
    assert.equal(found.total, MIN_INSIGHT + 1);
  });

  it("carries a denominator with every count, so a claim can be checked", () => {
    for (const insight of insights(demoTrades)) {
      assert.ok(insight.total >= insight.count, insight.kind);
      assert.ok(insight.total >= MIN_INSIGHT, insight.kind);
    }
  });
});

describe("storage, migration and malformed data (§29, §45)", () => {
  const valid: StoredTrade = {
    id: "keep-me", origin: "user", status: "planned",
    instrument: "forex", direction: "long", conceptIds: [],
    entry: toPrice(1.1), stop: toPrice(1.09), riskAmount: toMoney(100),
    openedAt: "2026-09-01T10:00:00.000Z",
  };

  it("reads the unversioned EPIC 08 array", () => {
    const result = migrate([...demoTrades]);
    assert.equal(result.from, 1);
    assert.equal(result.trades.length, demoTrades.length);
    assert.equal(result.dropped, 0);
  });

  it("reads its own current format", () => {
    const result = migrateJson(serializeStorage([valid]));
    assert.equal(result.from, STORAGE_VERSION);
    assert.equal(result.trades.length, 1);
  });

  it("keeps the good rows and counts the bad ones, rather than discarding all", () => {
    const result = migrate([valid, { id: "broken", entry: "not a price" }, null, 7]);
    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0]?.id, "keep-me");
    assert.equal(result.dropped, 3);
  });

  it("treats unreadable storage as empty rather than throwing", () => {
    for (const raw of ["{{{", "null", '"a string"', "12"]) {
      const result = migrateJson(raw);
      assert.deepEqual(result.trades, []);
    }
    assert.equal(migrateJson(null).from, 0, "nothing stored is version 0");
  });

  it("distinguishes an empty journal from a first visit", () => {
    // Version 0 means seed the demo set; version 1+ with no rows means the
    // user deleted everything and must not have it resurrected.
    assert.equal(migrateJson(null).from, 0);
    assert.equal(migrateJson(serializeStorage([])).from, STORAGE_VERSION);
  });

  it("defaults an unknown origin to `user`, the choice that cannot lose data", () => {
    const result = migrate([{ ...valid, origin: undefined }]);
    assert.equal(result.trades[0]?.origin, "user");
  });

  it("survives a full create/read/update/delete cycle", async () => {
    const repository = new MemoryTradeRepository();
    await repository.create(valid);
    assert.equal((await repository.list()).length, 1);
    assert.equal((await repository.get("keep-me"))?.status, "planned");

    await repository.update("keep-me", { status: "cancelled" });
    assert.equal((await repository.get("keep-me"))?.status, "cancelled");

    assert.equal(await repository.remove("keep-me"), true);
    assert.equal(await repository.remove("keep-me"), false);
    assert.deepEqual(await repository.list(), []);
  });

  it("notifies subscribers on every write, which is what recomputes the UI", async () => {
    const repository = new MemoryTradeRepository();
    let notifications = 0;
    const stop = repository.subscribe(() => { notifications += 1; });

    await repository.create(valid);
    await repository.update("keep-me", { status: "open" });
    await repository.remove("keep-me");
    stop();
    await repository.create(valid);

    assert.equal(notifications, 3, "one per write, and none after unsubscribing");
  });
});

describe("storage mode (§27, §50)", () => {
  it("names the mix honestly rather than picking a flattering half", () => {
    assert.equal(storageMode([]), "empty");
    assert.equal(storageMode(demoTrades), "demo");
    assert.equal(storageMode([{ origin: "user" }]), "local");
    assert.equal(storageMode([{ origin: "demo" }, { origin: "user" }]), "mixed");
  });
});

describe("fragment addressing (§34)", () => {
  it("round-trips a trade id, mode and save flag", () => {
    for (const mode of ["view", "edit", "review"] as const) {
      for (const saved of [false, true]) {
        const state = { tradeId: "demo-01", mode, saved };
        assert.deepEqual(parseFragment(serializeFragment(state)), state);
      }
    }
  });

  it("degrades a malformed or unknown fragment to a safe read-only state", () => {
    const empty = { tradeId: null, mode: "view", saved: false };
    assert.deepEqual(parseFragment(""), empty);
    assert.deepEqual(parseFragment("#nonsense"), empty);
    assert.deepEqual(parseFragment("#trade="), empty);
    // An unrecognised mode must never fall through to something destructive.
    assert.deepEqual(parseFragment("#trade=x&mode=delete"), {
      tradeId: "x", mode: "view", saved: false,
    });
  });

  it("carries the save confirmation across the remount that creating causes", () => {
    // Creating navigates /app/trades/new → /app/trades, which remounts the
    // shell and destroys component state. Verified in the browser; this test
    // pins the mechanism that replaced it.
    const hash = serializeFragment({ tradeId: "t1", mode: "view", saved: true });
    assert.ok(hash.includes("saved=1"));
    assert.equal(parseFragment(hash).saved, true);
    // And it is not sticky: the shell rewrites the fragment without it.
    assert.equal(parseFragment(serializeFragment(parseFragment(hash))).saved, true);
    assert.equal(
      parseFragment(serializeFragment({ ...parseFragment(hash), saved: false })).saved,
      false,
    );
  });
});

describe("application routing (§34, §35)", () => {
  it("resolves every prerendered screen", () => {
    for (const segments of appScreenSegments) {
      assert.notEqual(resolveAppScreen(segments), null, segments.join("/"));
    }
  });

  it("404s an unknown screen instead of falling back to the dashboard", () => {
    assert.equal(resolveAppScreen(["nope"]), null);
    assert.equal(resolveAppScreen(["trades", "edit"]), null);
    assert.equal(resolveAppScreen(["trades", "new", "extra"]), null);
    // The critical one: a trade id must never resolve to a route.
    assert.equal(resolveAppScreen(["trades", "demo-01"]), null);
  });

  it("generates no static route containing a record id (§34, §46)", () => {
    const flat = appScreenSegments.map((s) => s.join("/"));
    for (const trade of demoTrades) {
      assert.equal(flat.some((route) => route.includes(trade.id)), false, trade.id);
    }
  });
});

describe("privacy regressions (§33, §46)", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  it("keeps journal records out of the public search index", () => {
    // The two modules that decide what search can reach: the palette that
    // assembles the providers, and the loaders that fetch their data.
    for (const file of ["components/navigation/CommandPalette.tsx", "lib/search/indexes.ts"]) {
      const source = read(file);
      for (const needle of ["journal", "Trade", "demo-data"]) {
        assert.equal(source.includes(needle), false, `${file} must not reach ${needle}`);
      }
    }
  });

  it("never threads private data through the shared navigation", () => {
    const navbar = read("components/navigation/Navbar.tsx");
    assert.equal(navbar.includes("journal/"), false);
  });

  it("touches localStorage in exactly one module", () => {
    const files = [
      "components/journal/app/JournalApp.tsx",
      "components/journal/app/TradesView.tsx",
      "components/journal/app/TradeForm.tsx",
      "components/journal/app/ReviewView.tsx",
      "components/journal/app/SettingsView.tsx",
      "components/journal/app/DashboardView.tsx",
      "components/journal/app/AnalyticsView.tsx",
      "components/journal/JournalDemo.tsx",
    ];
    for (const file of files) {
      assert.equal(read(file).includes("localStorage"), false, `${file} must go through the repository`);
    }
    assert.ok(read("lib/journal/repository.ts").includes("localStorage"));
  });

  it("keeps the application shell noindex and free of generated record routes", () => {
    const route = read("app/[locale]/app/[[...view]]/page.tsx");
    assert.ok(route.includes("index: false"));
    assert.ok(route.includes("dynamicParams = false"));
    // The route must build its params from the screen list, never from records.
    assert.equal(/import[^;]*demo-data/.test(route), false);
    assert.equal(/import[^;]*repository/.test(route), false);
  });

  it("has no authentication, real or simulated (§46)", () => {
    // Auth-shaped identifiers, not the bare word "session" — the shell says in
    // prose that there is no session, and that sentence is the point.
    const files = [
      "components/journal/app/JournalApp.tsx",
      "components/journal/app/SettingsView.tsx",
      "lib/journal/repository.ts",
    ];
    for (const file of files) {
      const source = read(file);
      for (const needle of [
        "signIn", "signOut", "logIn", "logOut", "isLoggedIn",
        "currentUser", "getSession", "useSession", "authToken", "credentials",
      ]) {
        assert.equal(source.includes(needle), false, `${file}: no fake auth (${needle})`);
      }
    }
  });
});

describe("localization completeness (§39)", () => {
  const locales = { en, fa };

  it("translates every issue code in both locales", () => {
    for (const [name, dictionary] of Object.entries(locales)) {
      const errors = dictionary.journal.app.errors as Record<string, string>;
      for (const code of issueCodes) {
        assert.equal(typeof errors[code], "string", `${name} is missing errors.${code}`);
        assert.notEqual(errors[code], "", `${name}.errors.${code} is empty`);
      }
    }
  });

  it("has a label for every required field and every app view", () => {
    for (const [name, dictionary] of Object.entries(locales)) {
      const app = dictionary.journal.app;
      for (const field of requiredDraftFields) {
        assert.equal(
          typeof (app.capture.fields as Record<string, string>)[field],
          "string",
          `${name} is missing capture.fields.${field}`,
        );
      }
      for (const view of appViews) {
        assert.equal(typeof (app.nav as Record<string, string>)[view], "string", `${name}.nav.${view}`);
      }
    }
  });

  it("uses no parentheses anywhere in the Persian journal copy", () => {
    // House rule: parentheses break RTL rendering.
    const walk = (node: unknown, path: string): string[] => {
      if (typeof node === "string") return /[()]/.test(node) ? [path] : [];
      if (Array.isArray(node)) return node.flatMap((v, i) => walk(v, `${path}[${i}]`));
      if (typeof node === "object" && node !== null) {
        return Object.entries(node).flatMap(([k, v]) => walk(v, `${path}.${k}`));
      }
      return [];
    };
    assert.deepEqual(walk(fa.journal, "journal"), []);
  });

  it("describes the same capture form in both locales", () => {
    const keys = (o: object): string[] => Object.keys(o).sort();
    assert.deepEqual(keys(en.journal.app.capture.fields), keys(fa.journal.app.capture.fields));
    assert.deepEqual(keys(en.journal.app.errors), keys(fa.journal.app.errors));
    assert.deepEqual(keys(en.journal.app.settings), keys(fa.journal.app.settings));
  });
});

describe("the domain refuses what the form cannot show (§9)", () => {
  it("has a translated message for every code validation can emit", () => {
    // Belt and braces against a code being added to the union without copy:
    // the type says it exists, this asserts a user could read it.
    const emitted = new Set<IssueCode>();
    const probes: StoredTrade[] = [
      { ...(demoTrades[0] as StoredTrade), id: "" },
      { ...(demoTrades[0] as StoredTrade), entry: -1 },
      { ...(demoTrades[0] as StoredTrade), stop: (demoTrades[0] as StoredTrade).entry },
      { ...(demoTrades[0] as StoredTrade), riskAmount: 0 },
      { ...(demoTrades[0] as StoredTrade), openedAt: "not a date" },
    ];
    for (const probe of probes) {
      for (const issue of validateTrade(probe)) emitted.add(issue.code);
    }
    assert.ok(emitted.size > 0);
    for (const code of emitted) {
      assert.equal(typeof (en.journal.app.errors as Record<string, string>)[code], "string", code);
    }
  });
});
