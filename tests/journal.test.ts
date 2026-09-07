import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import {
  conceptUsage,
  maxDrawdown,
  MIN_SAMPLE,
  performance,
  process as processSummary,
  ruleViolations,
  setupUsage,
} from "../lib/journal/analytics";
import {
  adherenceRate,
  closedTrades,
  holdingMinutes,
  outcome,
  plannedR,
  realisedPnl,
  riskDistance,
  rMultiple,
} from "../lib/journal/calculations";
import { demoTrades } from "../lib/journal/demo-data";
import { formatMoney, formatR, formatSignedMoney, NO_VALUE } from "../lib/journal/format";
import {
  basisPointsToNumber,
  meanMoney,
  ratioToBasisPoints,
  roundHalfAway,
  sumMoney,
  toMoney,
  toPrice,
} from "../lib/journal/money";
import {
  InvalidTradeError,
  LocalTradeRepository,
  MemoryTradeRepository,
} from "../lib/journal/repository";
import { validateTrade, type StoredTrade } from "../lib/journal/trade";
import { isTradingConceptId } from "../lib/trading/concepts";
import { getSetup } from "../lib/trading/setups";

/**
 * EPIC 08 — the Journal domain, calculations, storage and privacy boundary.
 *
 * The tests that carry weight are the ones that keep the product honest: that
 * money arithmetic is exact, that a metric without a sample returns nothing
 * rather than zero, and that private records cannot reach a public surface.
 */

function trade(overrides: Partial<StoredTrade> = {}): StoredTrade {
  return {
    id: "t1", origin: "user", status: "closed",
    instrument: "metals", direction: "short",
    conceptIds: ["liquidity"],
    entry: toPrice(2000), stop: toPrice(2010), target: toPrice(1980),
    exit: toPrice(1980), riskAmount: toMoney(100),
    openedAt: "2026-08-03T09:00:00.000Z",
    closedAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("money arithmetic is exact", () => {
  it("stores money as integer minor units", () => {
    assert.equal(toMoney(12.34), 1234);
    assert.equal(toMoney(0.1) + toMoney(0.2), toMoney(0.3));
  });

  it("sums without floating-point drift", () => {
    // The canonical failure: 0.1 + 0.2 !== 0.3 in floats.
    const values = Array.from({ length: 10 }, () => toMoney(0.1));
    assert.equal(sumMoney(values), toMoney(1));
  });

  it("rounds half away from zero, symmetrically across zero", () => {
    // Math.round is half-UP, which biases losses toward zero on a ledger.
    assert.equal(roundHalfAway(2.5), 3);
    assert.equal(roundHalfAway(-2.5), -3);
    assert.equal(Math.round(-2.5), -2, "the platform default is asymmetric");
  });

  it("expresses ratios as integer basis points", () => {
    assert.equal(ratioToBasisPoints(1, 2), 5000);
    assert.equal(basisPointsToNumber(5000), 0.5);
    assert.equal(ratioToBasisPoints(1, 0), 0, "division by zero yields zero, not NaN");
  });

  it("returns null for the mean of an empty set rather than NaN", () => {
    assert.equal(meanMoney([]), null);
    assert.equal(meanMoney([toMoney(1), toMoney(2)]), toMoney(1.5));
  });
});

describe("trade calculations", () => {
  it("computes P&L from the risked distance, needing no position size", () => {
    // Entry 2000, stop 2010, exit 1980 short: 2R captured on 100 risked.
    assert.equal(realisedPnl(trade()), toMoney(200));
    assert.equal(rMultiple(trade()), 20000);
  });

  it("signs the result by direction", () => {
    const long = trade({ direction: "long", entry: toPrice(2000), stop: toPrice(1990), exit: toPrice(2020) });
    assert.equal(realisedPnl(long), toMoney(200));
    const losing = trade({ direction: "long", entry: toPrice(2000), stop: toPrice(1990), exit: toPrice(1990) });
    assert.equal(realisedPnl(losing), toMoney(-100));
  });

  it("classifies outcome, and breakeven is its own state", () => {
    assert.equal(outcome(trade()), "win");
    assert.equal(outcome(trade({ exit: toPrice(2010) })), "loss");
    assert.equal(outcome(trade({ exit: toPrice(2000) })), "breakeven");
  });

  it("returns null for a trade that has not closed", () => {
    const open = trade({ status: "open", exit: undefined, closedAt: undefined });
    assert.equal(realisedPnl(open), null);
    assert.equal(rMultiple(open), null);
    assert.equal(outcome(open), null);
  });

  it("computes planned R before the trade is taken", () => {
    assert.equal(plannedR(trade()), 20000);
    assert.equal(plannedR(trade({ target: undefined })), null);
  });

  it("computes holding time and rejects a close before an open", () => {
    assert.equal(holdingMinutes(trade()), 180);
    assert.equal(holdingMinutes(trade({ closedAt: "2026-08-03T08:00:00.000Z" })), null);
  });

  it("excludes inapplicable rules from adherence", () => {
    const reviewed = trade({
      review: {
        rules: [
          { id: "context", adherence: "followed" },
          { id: "setup", adherence: "violated" },
          { id: "risk", adherence: "notApplicable" },
          { id: "execution", adherence: "unknown" },
        ],
        conceptIds: [],
        reviewedAt: "2026-08-03T18:00:00.000Z",
      },
    });
    // 1 followed of 2 applicable, not of 4.
    assert.equal(adherenceRate(reviewed), 5000);
    assert.equal(adherenceRate(trade()), null, "no review means no rate");
  });

  it("riskDistance is always positive", () => {
    assert.ok(riskDistance(trade()) > 0);
    assert.ok(riskDistance(trade({ direction: "long", stop: toPrice(1990) })) > 0);
  });
});

describe("analytics refuses to invent results", () => {
  it("returns null rather than zero when there is no sample", () => {
    const empty = performance([]);
    assert.equal(empty.netPnl, null);
    assert.equal(empty.averageR, null);
    assert.equal(empty.winRate, null);
    assert.equal(empty.expectancy, null);
    assert.equal(empty.maxDrawdown, null);
    assert.equal(empty.sample, 0);
  });

  it("withholds win rate and expectancy below the minimum sample", () => {
    const few = Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => trade({ id: `t${i}` }));
    const summary = performance(few);
    assert.equal(summary.winRate, null, "a rate from four trades is an anecdote");
    assert.equal(summary.expectancy, null);
    // Figures that do not claim to describe a process are still available.
    assert.notEqual(summary.netPnl, null);
    assert.equal(summary.sample, MIN_SAMPLE - 1);
  });

  it("reports them once the sample is sufficient", () => {
    const enough = Array.from({ length: MIN_SAMPLE }, (_, i) => trade({ id: `t${i}` }));
    const summary = performance(enough);
    assert.equal(summary.winRate, 10000, "five wins is 100%");
    assert.notEqual(summary.expectancy, null);
  });

  it("keeps breakeven trades in the win-rate denominator", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => trade({ id: `w${i}` })),
      ...Array.from({ length: 2 }, (_, i) => trade({ id: `b${i}`, exit: toPrice(2000) })),
    ];
    assert.equal(performance(rows).winRate, 6000, "3 of 5, not 3 of 3");
  });

  it("computes drawdown as the largest peak-to-trough fall", () => {
    assert.equal(maxDrawdown([100, -50, -30, 200]), 80);
    assert.equal(maxDrawdown([100, 200]), 0);
    assert.equal(maxDrawdown([]), 0);
  });

  it("counts concept and setup usage from real references", () => {
    const rows = conceptUsage(demoTrades);
    assert.ok(rows.length > 0);
    for (const row of rows) assert.ok(isTradingConceptId(row.id));
    for (const row of setupUsage(demoTrades)) {
      assert.ok(getSetup(row.id) !== undefined, `dangling setup "${row.id}"`);
    }
  });

  it("surfaces the review queue and rule violations", () => {
    const proc = processSummary(demoTrades);
    assert.ok(proc.awaitingReview > 0, "the demo set must exercise the queue");
    assert.ok(ruleViolations(demoTrades).length > 0);
  });
});

describe("demo metrics are derived, never typed in", () => {
  it("changing the demo records changes the metrics", () => {
    // §37 as an executable assertion.
    const before = performance(demoTrades);
    const mutated = demoTrades.map((t, i) =>
      i === 0 && t.status === "closed" ? { ...t, exit: t.entry } : t,
    );
    const after = performance(mutated);
    assert.notEqual(before.netPnl, after.netPnl);
    assert.notEqual(before.wins, after.wins);
  });

  it("every demo trade is valid and labelled as demo", () => {
    for (const t of demoTrades) {
      assert.deepEqual(validateTrade(t), [], `${t.id} is invalid`);
      assert.equal(t.origin, "demo", `${t.id} is not labelled as demo`);
    }
  });

  it("the demo set is mixed, not a flattering curve", () => {
    const closed = closedTrades(demoTrades);
    const outcomes = closed.map(outcome);
    assert.ok(outcomes.includes("win"));
    assert.ok(outcomes.includes("loss"), "a demo without losses is a performance claim");
    assert.ok(outcomes.includes("breakeven"));
    assert.ok(demoTrades.some((t) => t.status === "open"));
    assert.ok(demoTrades.some((t) => t.status === "cancelled"));
  });
});

describe("trade validation", () => {
  it("accepts a well-formed trade", () => {
    assert.deepEqual(validateTrade(trade()), []);
  });

  it("rejects a stop on the wrong side of entry", () => {
    const issues = validateTrade(trade({ direction: "long", stop: toPrice(2010) }));
    assert.ok(issues.some((i) => i.field === "stop"));
  });

  it("rejects zero risk distance", () => {
    const issues = validateTrade(trade({ stop: toPrice(2000) }));
    assert.ok(issues.some((i) => i.field === "stop"));
  });

  it("rejects a closed trade with no exit", () => {
    const issues = validateTrade(trade({ exit: undefined }));
    assert.ok(issues.some((i) => i.field === "exit"));
  });

  it("rejects an exit on a trade that is not closed", () => {
    const issues = validateTrade(trade({ status: "open" }));
    assert.ok(issues.some((i) => i.field === "exit"));
  });

  it("rejects a dangling concept reference", () => {
    const issues = validateTrade(trade({ conceptIds: ["not-a-concept" as never] }));
    assert.ok(issues.some((i) => i.field === "conceptIds"));
  });

  it("rejects a dangling setup reference", () => {
    const issues = validateTrade(trade({ setupId: "no-such-setup" }));
    assert.ok(issues.some((i) => i.field === "setupId"));
  });

  it("accepts a canonical setup reference", () => {
    assert.deepEqual(validateTrade(trade({ setupId: "liquidity-sweep-reversal" })), []);
  });

  it("reports issues rather than throwing on user data", () => {
    assert.doesNotThrow(() => validateTrade(trade({ entry: Number.NaN })));
  });
});

describe("the repository abstraction", () => {
  it("creates, reads, updates and removes", async () => {
    const repo = new MemoryTradeRepository();
    await repo.create(trade({ id: "a" }));
    assert.equal((await repo.list()).length, 1);
    assert.equal((await repo.get("a"))?.id, "a");

    const updated = await repo.update("a", { notes: "checked" });
    assert.equal(updated?.notes, "checked");
    assert.equal(await repo.remove("a"), true);
    assert.equal((await repo.list()).length, 0);
    assert.equal(await repo.remove("a"), false);
  });

  it("refuses to store an invalid record", async () => {
    const repo = new MemoryTradeRepository();
    await assert.rejects(() => repo.create(trade({ stop: toPrice(2000) })), InvalidTradeError);
    await repo.create(trade({ id: "a" }));
    await assert.rejects(() => repo.create(trade({ id: "a" })), InvalidTradeError);
  });

  it("refuses to let a patch make a record invalid", async () => {
    const repo = new MemoryTradeRepository([trade({ id: "a" })]);
    await assert.rejects(() => repo.update("a", { stop: toPrice(2000) }), InvalidTradeError);
    assert.equal((await repo.get("a"))?.stop, toPrice(2010), "the record is unchanged");
  });

  it("never lets a demo record become a user record", async () => {
    const repo = new MemoryTradeRepository([trade({ id: "a", origin: "demo" })]);
    const patched = await repo.update("a", { id: "b", origin: "user" } as never);
    assert.equal(patched?.id, "a");
    assert.equal(patched?.origin, "demo");
  });

  it("hands out copies, so a caller cannot mutate the store", async () => {
    const repo = new MemoryTradeRepository([trade({ id: "a" })]);
    const [first] = await repo.list();
    assert.ok(first !== undefined);
    (first as { notes?: string }).notes = "tampered";
    assert.equal((await repo.get("a"))?.notes, undefined);
  });

  it("notifies subscribers on writes and stops after unsubscribe", async () => {
    const repo = new MemoryTradeRepository();
    let calls = 0;
    const off = repo.subscribe(() => { calls += 1; });
    await repo.create(trade({ id: "a" }));
    assert.equal(calls, 1);
    off();
    await repo.create(trade({ id: "b" }));
    assert.equal(calls, 1);
  });

  it("drops malformed rows rather than crashing", async () => {
    // The local adapter reads untrusted JSON; validation is what makes that
    // safe, and it is the same pure function the domain uses.
    const repo = new LocalTradeRepository([trade({ id: "seed" })]);
    assert.equal((await repo.list()).length, 1);
  });
});

describe("formatting is presentation only", () => {
  it("formats absent values distinctly from zero", () => {
    assert.equal(formatMoney(null, "en"), NO_VALUE);
    assert.notEqual(formatMoney(0, "en"), NO_VALUE);
    assert.equal(formatR(null), NO_VALUE);
  });

  it("signs money so a loss reads as a loss without colour", () => {
    assert.ok(formatSignedMoney(toMoney(10), "en").startsWith("+"));
    assert.ok(formatSignedMoney(toMoney(-10), "en").startsWith("−"));
  });

  it("keeps R multiples left-to-right in both locales", () => {
    assert.equal(formatR(20000), "+2.00R");
    assert.equal(formatR(-10000), "−1.00R");
  });

  it("formats per locale without changing the stored value", () => {
    const en = formatMoney(toMoney(1234.5), "en");
    const fa = formatMoney(toMoney(1234.5), "fa");
    assert.notEqual(en, fa, "locale must change presentation");
    assert.ok(en.includes("1,234.5"));
  });
});

describe("privacy boundary", () => {
  it("no journal record is registered with public search", () => {
    // §24: private data must never enter the global index. The providers are
    // the only registration point, and none of them touches the journal.
    const palette = readFileSync(
      new URL("../components/navigation/CommandPalette.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(!palette.includes("journal/"), "the palette imports journal data");
    assert.ok(!palette.includes("demoTrades"));
    assert.ok(!palette.includes("TradeRepository"));
  });

  it("no journal data is threaded through the navbar", () => {
    const navbar = readFileSync(
      new URL("../components/navigation/Navbar.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(!navbar.includes("journal"), "the navbar carries journal data");
  });

  it("the app shell route renders no records on the server", () => {
    // The whole privacy argument: the prerendered HTML has nothing in it.
    const route = readFileSync(
      new URL("../app/[locale]/app/[[...view]]/page.tsx", import.meta.url),
      "utf8",
    );
    // Checked as imports, not as text: a comment naming `TradeRepository` is
    // documentation, while an import of it would be the route touching storage.
    const imports = [...route.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
    assert.ok(!imports.some((from) => from?.includes("journal/demo-data")), "the route imports records");
    assert.ok(!imports.some((from) => from?.includes("journal/repository")), "the route touches storage");
    assert.ok(route.includes("index: false"), "the app shell must be noindex");
  });

  it("generates no static route per trade record", () => {
    const route = readFileSync(
      new URL("../app/[locale]/app/[[...view]]/page.tsx", import.meta.url),
      "utf8",
    );
    // A route per record would put ids into the build output and the sitemap.
    assert.ok(!/generateStaticParams[\s\S]*trade\.id/.test(route));
  });

  it("the repository is the only module that touches browser storage", () => {
    const repo = readFileSync(
      new URL("../lib/journal/repository.ts", import.meta.url),
      "utf8",
    );
    assert.ok(repo.includes("localStorage"));
    for (const file of ["../components/journal/app/JournalApp.tsx", "../components/journal/JournalDemo.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.ok(!source.includes("localStorage"), `${file} reaches storage directly`);
    }
  });
});

describe("localization completeness", () => {
  for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
    it(`${name}: journal copy is complete`, () => {
      for (const key of ["eyebrow", "title", "lead", "demoLabel", "demoNote", "insufficient"] as const) {
        assert.ok(dict.journal[key].length > 0, `${name}.journal.${key} is empty`);
      }
      for (const stage of ["record", "review", "classify", "measure", "discover", "refine"] as const) {
        assert.ok(dict.journal.stages[stage].label.length > 0);
        assert.ok(dict.journal.stages[stage].body.length > 0);
      }
      for (const view of ["dashboard", "trades", "review", "analytics"] as const) {
        assert.ok(dict.journal.app.nav[view].length > 0);
      }
    });
  }

  it("Persian journal copy contains no parentheses", () => {
    const blob = JSON.stringify(fa.journal);
    assert.ok(!blob.includes("("));
    assert.ok(!blob.includes(")"));
  });

  it("promises no performance and claims no users", () => {
    const banned = [
      "guaranteed", "win rate of", "traders trust", "join thousands",
      "proven results", "risk-free", "testimonial",
    ];
    const blob = JSON.stringify(en.journal).toLowerCase();
    for (const phrase of banned) assert.ok(!blob.includes(phrase), `copy contains "${phrase}"`);
  });
});
