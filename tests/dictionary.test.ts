import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import { createDictionaryProvider } from "../lib/search/dictionary-provider";
import type { SearchContext } from "../lib/search/provider";
import { getConcept, isTradingConceptId, tradingConceptIds } from "../lib/trading/concepts";
import {
  categories,
  conceptContext,
  conceptForSlug,
  dictionaryEntries,
  dictionaryHref,
  entriesInCategory,
  getEntry,
  publishedEntries,
  slugForConcept,
} from "../lib/trading/dictionary";
import { getLesson } from "../lib/trading/lessons";
import { getSetup } from "../lib/trading/setups";

/**
 * EPIC 07 — the Dictionary as a surface over TradingConcept.
 *
 * The tests that carry weight are the ones proving there is still exactly one
 * concept identity in the product, and that every relationship shown on a term
 * page is derived from the canonical graph rather than restated.
 */

describe("canonical identity", () => {
  it("every entry is addressed by a canonical concept id", () => {
    for (const entry of dictionaryEntries) {
      assert.ok(
        isTradingConceptId(entry.conceptId),
        `entry references unknown concept "${entry.conceptId}"`,
      );
    }
  });

  it("the Dictionary introduces no second identity", () => {
    // If an entry ever grows its own primary key, this fails: the only key
    // present must be `conceptId`.
    for (const entry of dictionaryEntries) {
      const keys = Object.keys(entry);
      assert.ok(!keys.includes("id"), "an entry must not carry its own `id`");
      assert.ok(!keys.includes("slug"), "slug is derived, never stored");
    }
  });

  it("covers all 19 canonical concepts exactly once", () => {
    assert.equal(dictionaryEntries.length, tradingConceptIds.length);
    const seen = new Set(dictionaryEntries.map((e) => e.conceptId));
    assert.equal(seen.size, tradingConceptIds.length, "duplicate concept entry");
    for (const id of tradingConceptIds) assert.ok(seen.has(id), `"${id}" has no entry`);
  });

  it("only published entries are reachable", () => {
    for (const entry of publishedEntries) assert.equal(entry.status, "published");
    for (const entry of dictionaryEntries) {
      if (entry.status !== "published") {
        assert.equal(getEntry(entry.conceptId), undefined, "a draft must not resolve");
        assert.equal(conceptForSlug(slugForConcept(entry.conceptId)), undefined);
      }
    }
  });
});

describe("slugs and routes", () => {
  it("slug is derived from identity, not stored as it", () => {
    assert.equal(slugForConcept("liquidity"), "liquidity");
    assert.equal(slugForConcept("equalHighs"), "equal-highs");
    assert.equal(slugForConcept("positionSize"), "position-size");
  });

  it("every slug is URL-safe and unique", () => {
    const seen = new Set<string>();
    for (const entry of publishedEntries) {
      const slug = slugForConcept(entry.conceptId);
      assert.match(slug, /^[a-z0-9-]+$/, `"${slug}" is not URL-safe`);
      assert.ok(!seen.has(slug), `duplicate slug "${slug}"`);
      seen.add(slug);
    }
  });

  it("round-trips slug to concept and back", () => {
    for (const entry of publishedEntries) {
      const slug = slugForConcept(entry.conceptId);
      assert.equal(conceptForSlug(slug), entry.conceptId);
    }
  });

  it("an unknown slug resolves to nothing, so the route can 404", () => {
    assert.equal(conceptForSlug("liquidity-meaning"), undefined);
    assert.equal(conceptForSlug("not-a-concept"), undefined);
  });

  it("builds one canonical route per locale", () => {
    assert.equal(dictionaryHref("en", "mss"), "/en/dictionary/mss");
    assert.equal(dictionaryHref("fa", "equalLows"), "/fa/dictionary/equal-lows");
  });

  it("generates a static path for every entry in both locales", () => {
    const params = ["en", "fa"].flatMap((locale) =>
      publishedEntries.map((e) => ({ locale, slug: slugForConcept(e.conceptId) })),
    );
    assert.equal(params.length, publishedEntries.length * 2);
    for (const { slug } of params) assert.ok(conceptForSlug(slug) !== undefined);
  });
});

describe("categories are derived", () => {
  it("every category has entries and every entry a category", () => {
    const groups = categories();
    assert.ok(groups.length > 1);
    assert.equal(
      groups.reduce((n, g) => n + g.count, 0),
      publishedEntries.length,
    );
    for (const group of groups) {
      assert.equal(entriesInCategory(group.id).length, group.count);
    }
  });

  it("both locales label every category present in the data", () => {
    for (const { id } of categories()) {
      assert.ok(en.dict.categories[id], `en is missing category "${id}"`);
      assert.ok(fa.dict.categories[id], `fa is missing category "${id}"`);
    }
  });
});

describe("relationships are derived, never restated", () => {
  it("related, prerequisites and children come from the concept graph", () => {
    const context = conceptContext("liquidity");
    assert.ok(context !== undefined);
    const concept = getConcept("liquidity");
    assert.deepEqual([...context.related], [...concept.related]);
    assert.deepEqual([...context.prerequisites], [...concept.prerequisites]);
    // Children are the inverse of `parent`, computed not stored.
    assert.deepEqual([...context.children].sort(), ["equalHighs", "equalLows", "sweep"]);
  });

  it("every referenced concept in a context actually exists", () => {
    for (const entry of publishedEntries) {
      const context = conceptContext(entry.conceptId);
      assert.ok(context !== undefined);
      for (const id of [...context.related, ...context.prerequisites, ...context.children]) {
        assert.ok(getEntry(id) !== undefined, `"${entry.conceptId}" → unpublished "${id}"`);
      }
    }
  });

  it("the Academy lesson resolves to a real lesson", () => {
    for (const entry of publishedEntries) {
      const context = conceptContext(entry.conceptId);
      if (context?.lesson === undefined) continue;
      assert.ok(getLesson(context.lesson.slug) !== undefined);
      assert.ok(
        context.lesson.conceptIds.includes(entry.conceptId),
        `lesson "${context.lesson.id}" does not teach "${entry.conceptId}"`,
      );
    }
  });

  it("related setups resolve to real setups that use the concept", () => {
    for (const entry of publishedEntries) {
      const context = conceptContext(entry.conceptId);
      assert.ok(context !== undefined);
      for (const setup of context.setups) {
        assert.ok(getSetup(setup.slug) !== undefined, `dangling setup "${setup.slug}"`);
        assert.ok(setup.conceptIds.includes(entry.conceptId));
      }
    }
  });

  it("a stage concept knows its own stage and a mechanism inherits its parent's", () => {
    assert.equal(conceptContext("liquidity")?.stage, "liquidity");
    assert.equal(conceptContext("sweep")?.stage, "liquidity");
    assert.equal(conceptContext("mss")?.stage, "structure");
  });

  it("no relationship is duplicated into the dictionary layer", () => {
    // §27: the Dictionary stores category and aliases only. If an edge field
    // ever appears on an entry, the graph has been copied.
    for (const entry of dictionaryEntries) {
      for (const forbidden of ["related", "prerequisites", "parent", "children", "lessons", "setups"]) {
        assert.ok(!(forbidden in entry), `entry stores "${forbidden}" — the graph is duplicated`);
      }
    }
  });
});

describe("content completeness", () => {
  for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
    it(`${name}: every concept has a term, a short and a full definition`, () => {
      for (const id of tradingConceptIds) {
        const copy = dict.concepts[id];
        assert.ok(copy !== undefined, `${name} is missing "${id}"`);
        assert.ok(copy.term.length > 0, `${name}.${id}.term is empty`);
        assert.ok(copy.definition.length > 0, `${name}.${id}.definition is empty`);
        assert.ok(copy.full.length > 0, `${name}.${id}.full is empty`);
        // The full definition must add something, not restate the short one.
        assert.ok(copy.full.length > copy.definition.length, `${name}.${id}.full adds nothing`);
      }
    });

    it(`${name}: every dictionary UI string exists`, () => {
      for (const key of ["eyebrow", "title", "lead", "shortLabel", "fullLabel", "openDictionary"] as const) {
        assert.ok(dict.dict[key].length > 0, `${name}.dict.${key} is empty`);
      }
    });
  }

  it("does not silently fall back to English for Persian content", () => {
    for (const id of tradingConceptIds) {
      assert.notEqual(fa.concepts[id].full, en.concepts[id].full, `"${id}" full is untranslated`);
      assert.notEqual(fa.concepts[id].definition, en.concepts[id].definition, `"${id}" short is untranslated`);
    }
  });

  it("Persian dictionary copy contains no parentheses", () => {
    const blob = JSON.stringify({ dict: fa.dict, concepts: fa.concepts });
    assert.ok(!blob.includes("("));
    assert.ok(!blob.includes(")"));
  });

  it("makes no guru claims", () => {
    const banned = ["guaranteed", "secret strategy", "never lose", "100% accurate", "easy profit", "win rate"];
    const blob = JSON.stringify({ dict: en.dict, concepts: en.concepts }).toLowerCase();
    for (const phrase of banned) assert.ok(!blob.includes(phrase), `copy contains "${phrase}"`);
  });
});

describe("dictionary search provider", () => {
  const ctx: SearchContext = {
    locale: "en",
    labels: {
      pages: en.nav.resultsPages,
      commands: en.nav.resultsCommands,
      comingSoon: en.nav.comingSoon,
      toggleTheme: en.nav.cmdToggleTheme,
      switchLanguage: en.nav.cmdSwitchLanguage,
      scrollTop: en.nav.cmdScrollTop,
    },
  };
  const provider = createDictionaryProvider(async () => ({
    concepts: en.concepts,
    dict: en.dict,
  }));

  it("does not load its index until something is searched", async () => {
    let loads = 0;
    const counted = createDictionaryProvider(async () => {
      loads += 1;
      return { concepts: en.concepts, dict: en.dict };
    });
    assert.equal(loads, 0);
    await counted.search("liquidity", ctx);
    assert.equal(loads, 1);
    await counted.search("mss", ctx);
    assert.equal(loads, 1, "the index must be fetched once per session");
  });

  it("finds by English term", async () => {
    const hits = await provider.search("liquidity", ctx);
    assert.ok(hits.some((r) => r.id === "dict.liquidity"));
  });

  it("finds by abbreviation", async () => {
    for (const [q, id] of [["MSS", "dict.mss"], ["FVG", "dict.fvg"], ["BOS", "dict.bos"]] as const) {
      const hits = await provider.search(q, ctx);
      assert.ok(hits.some((r) => r.id === id), `"${q}" did not find ${id}`);
    }
  });

  it("finds by alias and by expansion", async () => {
    assert.ok((await provider.search("stop loss", ctx)).some((r) => r.id === "dict.invalidation"));
    assert.ok((await provider.search("fair value gap", ctx)).some((r) => r.id === "dict.fvg"));
    assert.ok((await provider.search("choch", ctx)).some((r) => r.id === "dict.mss"));
  });

  it("finds by canonical concept id", async () => {
    const hits = await provider.search("positionSize", ctx);
    assert.ok(hits.some((r) => r.id === "dict.positionSize"));
  });

  it("finds by Persian term", async () => {
    const faProvider = createDictionaryProvider(async () => ({
      concepts: fa.concepts,
      dict: fa.dict,
    }));
    const hits = await faProvider.search("نقدینگی", { ...ctx, locale: "fa" });
    const hit = hits.find((r) => r.id === "dict.liquidity");
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/fa/dictionary/liquidity");
  });

  it("does not index full definitions", async () => {
    // A phrase that appears only in a full definition must not match — the
    // index stays metadata-only so it can be loaded cheaply.
    const phrase = "reverses a common intuition";
    assert.ok(en.concepts.liquidity.full.includes(phrase));
    assert.equal((await provider.search(phrase, ctx)).length, 0);
  });

  it("returns nothing for a genuine miss", async () => {
    assert.equal((await provider.search("zzzznotathing", ctx)).length, 0);
  });
});
