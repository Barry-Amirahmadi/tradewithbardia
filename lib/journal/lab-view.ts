import type { Dictionary } from "../i18n/dictionary-type";

/**
 * WHAT THE JOURNAL ACTUALLY NEEDS FROM THE SETUP LAB — EPIC 10 §16, §18.
 *
 * THE DEFECT THIS FIXES. `/app/*` was handed `dictionary.lab` whole, so every
 * one of the twelve application routes serialized the complete specification
 * prose for all five setups — purpose, context, liquidity, structure, trigger,
 * entry, invalidation, risk and review — into its RSC payload. Measured on the
 * EPIC 09 build: **7,887 bytes raw / 2,921 gzipped per route, 34 kB gzipped
 * across the build**, for text the application never renders. It needs five
 * titles and three enum label maps.
 *
 * This is the same class of defect EPIC 04 found in the Navbar, which is the
 * argument for a named projection rather than a one-line fix: passing a whole
 * dictionary branch "because the component might want it" is easy to do by
 * accident and invisible until someone weighs the HTML. A type that cannot
 * express the prose makes the mistake impossible to repeat here.
 *
 * The keys stay identical to the source dictionary, so `lab.items[slug].title`
 * and `lab.instruments[id]` read exactly as before at every call site — this
 * narrows the payload, not the vocabulary.
 */

type Lab = Dictionary["lab"];

export interface JournalLab {
  instruments: Lab["instruments"];
  sessions: Lab["sessions"];
  timeframes: Lab["timeframes"];
  /** Titles only. The specification lives in the Setup Lab, and is linked to. */
  items: { [K in keyof Lab["items"]]: { title: string } };
}

export function journalLab(lab: Lab): JournalLab {
  const items = {} as JournalLab["items"];
  for (const key of Object.keys(lab.items) as (keyof Lab["items"])[]) {
    items[key] = { title: lab.items[key].title };
  }

  return {
    instruments: lab.instruments,
    sessions: lab.sessions,
    timeframes: lab.timeframes,
    items,
  };
}
