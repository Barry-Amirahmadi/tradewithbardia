import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import {
  createCommandProvider,
  createNavigationProvider,
} from "../lib/search/navigation-provider";
import {
  normalise,
  registerSearchProvider,
  scoreMatch,
  searchAll,
  type SearchContext,
  type SearchProvider,
  type SearchResult,
} from "../lib/search/provider";

const labels = {
  pages: en.nav.resultsPages,
  commands: en.nav.resultsCommands,
  comingSoon: en.nav.comingSoon,
  toggleTheme: en.nav.cmdToggleTheme,
  switchLanguage: en.nav.cmdSwitchLanguage,
  scrollTop: en.nav.cmdScrollTop,
};

const ctxEn: SearchContext = { locale: "en", labels };
const ctxFa: SearchContext = { locale: "fa", labels };

describe("match scoring", () => {
  it("ranks a prefix match above a word-boundary match above a mid-word one", () => {
    assert.ok(scoreMatch("Setup Laboratory", "setup") > scoreMatch("Trading Setup", "setup"));
    assert.ok(scoreMatch("Trading Setup", "setup") > scoreMatch("Presetup", "setup"));
  });

  it("is case insensitive", () => {
    assert.ok(scoreMatch("Journal", "JOURNAL") > 0);
  });

  it("returns 0 for a genuine miss", () => {
    assert.equal(scoreMatch("Dictionary", "zzz"), 0);
  });

  it("treats an empty query as a match, so the palette can list everything", () => {
    assert.ok(scoreMatch("anything", "") > 0);
  });
});

describe("Persian normalisation", () => {
  it("folds the Arabic yeh and kaf onto their Persian forms", () => {
    // A reader typing with an Arabic keyboard must still match Persian copy.
    assert.equal(normalise("كيف"), normalise("کیف"));
  });

  it("strips Arabic diacritics", () => {
    assert.equal(normalise("نَقدینگی"), normalise("نقدینگی"));
  });

  it("matches Persian nav labels", () => {
    assert.ok(scoreMatch(fa.nav.setups, "ستاپ") > 0);
    assert.ok(scoreMatch(fa.nav.journal, "ژورنال") > 0);
  });
});

describe("navigation search provider", () => {
  const provider = createNavigationProvider(en.nav);

  it("finds a top-level destination and gives it a working href", () => {
    const results = provider.search("journal", ctxEn) as ReturnType<
      typeof provider.search
    > extends Promise<infer R> ? R : never;
    const hit = (results as { id: string; href?: string }[]).find(
      (r) => r.id === "nav.journal",
    );
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/en/journal");
  });

  it("locale-prefixes hrefs for Persian", () => {
    const results = createNavigationProvider(fa.nav).search("ژورنال", ctxFa) as {
      id: string;
      href?: string;
    }[];
    const hit = results.find((r) => r.id === "nav.journal");
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/fa/journal");
  });

  it("indexes planned destinations but leaves them unreachable", () => {
    const results = provider.search("replay", ctxEn) as {
      id: string;
      href?: string;
      subtitle?: string;
    }[];
    const hit = results.find((r) => r.id === "nav.setups.replay");
    assert.ok(hit !== undefined, "a planned destination should still be findable");
    assert.equal(hit.href, undefined, "…but must not link anywhere");
    assert.ok(hit.subtitle?.includes(en.nav.comingSoon));
  });

  it("ranks a top-level destination above a child of the same name", () => {
    const results = provider.search("dictionary", ctxEn) as {
      id: string;
      score: number;
    }[];
    const top = results.find((r) => r.id === "nav.dictionary");
    const child = results.find((r) => r.id === "nav.dictionary.index");
    assert.ok(top !== undefined);
    if (child !== undefined) assert.ok(top.score > child.score);
  });
});

describe("command provider", () => {
  const provider = createCommandProvider();

  it("exposes the three palette commands", () => {
    const results = provider.search("", ctxEn) as { commandId?: string }[];
    const ids = results.map((r) => r.commandId).sort();
    assert.deepEqual(ids, ["scroll-top", "switch-language", "toggle-theme"]);
  });

  it("commands are always reachable — they never depend on content existing", () => {
    const results = provider.search("", ctxEn) as { commandId?: string }[];
    for (const r of results) assert.ok(r.commandId !== undefined);
  });
});

describe("provider registry", () => {
  it("merges providers, sorts by score, and unregisters cleanly", async () => {
    const offNav = registerSearchProvider(createNavigationProvider(en.nav));
    const offCmd = registerSearchProvider(createCommandProvider());

    const merged = await searchAll("theme", ctxEn);
    assert.ok(merged.some((r) => r.commandId === "toggle-theme"));
    for (let i = 1; i < merged.length; i += 1) {
      const prev = merged[i - 1];
      const cur = merged[i];
      assert.ok(prev !== undefined && cur !== undefined);
      assert.ok(prev.score >= cur.score, "results must be sorted by score");
    }

    offNav();
    offCmd();
    assert.deepEqual(await searchAll("theme", ctxEn), []);
  });

  it("one failing provider degrades to fewer results, not an empty palette", async () => {
    const offGood = registerSearchProvider(createCommandProvider());
    const offBad = registerSearchProvider({
      id: "explodes",
      search() {
        throw new Error("provider is offline");
      },
    });

    const results = await searchAll("theme", ctxEn);
    assert.ok(results.length > 0, "a broken provider must not empty the palette");

    offGood();
    offBad();
  });
});

/**
 * The registry's whole reason to exist is that Phase 2 and Phase 3 add four
 * more content domains. These tests stand in for those providers so the seam
 * is proven now, while it is still cheap to change — nothing here indexes real
 * content, and no backend provider is built.
 */
describe("extensibility — the Phase 2/3 domains", () => {
  const domain = (
    id: string,
    kind: SearchResult["kind"],
    title: string,
    delay = 0,
  ): SearchProvider => ({
    id,
    async search(query) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const score = scoreMatch(title, query);
      return score === 0
        ? []
        : [{ id: `${id}.1`, kind, title, href: `/en/${id}/1`, score }];
    },
  });

  it("merges four future async providers with no change to the palette", async () => {
    const off = [
      registerSearchProvider(domain("academy", "lesson", "Liquidity sweeps")),
      registerSearchProvider(domain("setups", "setup", "Liquidity unicorn")),
      registerSearchProvider(domain("dictionary", "term", "Liquidity")),
      registerSearchProvider(domain("journal", "journal", "Liquidity trade log")),
    ];

    const results = await searchAll("liquidity", ctxEn);
    const kinds = [...new Set(results.map((r) => r.kind))].sort();
    assert.deepEqual(kinds, ["journal", "lesson", "setup", "term"]);
    for (let i = 1; i < results.length; i += 1) {
      assert.ok((results[i - 1]?.score ?? 0) >= (results[i]?.score ?? 0));
    }

    off.forEach((fn) => fn());
  });

  it("results are plain data, so a server provider can return them over the wire", async () => {
    const off = registerSearchProvider(domain("academy", "lesson", "Order blocks"));
    const results = await searchAll("order", ctxEn);
    assert.ok(results.length > 0);
    // No functions, no class instances — survives a JSON round trip intact.
    assert.deepEqual(JSON.parse(JSON.stringify(results)), results);
    off();
  });

  it("a provider that hangs cannot hold the palette in a loading state", async () => {
    const off = [
      registerSearchProvider(createCommandProvider()),
      registerSearchProvider({
        id: "hangs",
        search: () => new Promise<SearchResult[]>(() => {}),
      }),
    ];

    const started = Date.now();
    const results = await searchAll("theme", ctxEn, 60);
    assert.ok(Date.now() - started < 1000, "the deadline must bound the fan-out");
    assert.ok(
      results.some((r) => r.commandId === "toggle-theme"),
      "a hanging provider must not take its siblings' results with it",
    );

    off.forEach((fn) => fn());
  });

  it("a slow-but-answering provider is still merged", async () => {
    const off = registerSearchProvider(domain("academy", "lesson", "Risk model", 40));
    const results = await searchAll("risk", ctxEn, 500);
    assert.ok(results.some((r) => r.kind === "lesson"));
    off();
  });

  it("unregistering does not tear down a newer provider with the same id", async () => {
    const first = registerSearchProvider(domain("academy", "lesson", "First"));
    const second = registerSearchProvider(domain("academy", "lesson", "Second"));

    // The palette remounting re-registers while the old cleanup still runs.
    first();
    const results = await searchAll("second", ctxEn);
    assert.ok(
      results.some((r) => r.title === "Second"),
      "an earlier cleanup must not delete the provider that replaced it",
    );

    second();
  });
});
