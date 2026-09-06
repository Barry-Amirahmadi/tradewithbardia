"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { localeDirection, withLocale, locales, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { useDismissableLayer } from "@/lib/interaction/use-dismissable-layer";
import { prefersReducedMotion } from "@/lib/motion/frame-loop";
import { createAcademyProvider } from "@/lib/search/academy-provider";
import { createConceptProvider } from "@/lib/search/concept-provider";
import { createDictionaryProvider } from "@/lib/search/dictionary-provider";
import {
  loadAcademyIndex,
  loadConceptIndex,
  loadDictionaryIndex,
  loadSetupIndex,
} from "@/lib/search/indexes";
import { createSetupProvider } from "@/lib/search/setup-provider";
import {
  createCommandProvider,
  createNavigationProvider,
} from "@/lib/search/navigation-provider";
import {
  registerSearchProvider,
  searchAll,
  type CommandId,
  type SearchLabels,
  type SearchResult,
} from "@/lib/search/provider";
import { applyTheme, readStoredTheme } from "@/lib/theme";

/**
 * COMMAND PALETTE — master prompt §9, §16, §17.
 *
 * Lazily loaded, so its cost lands only when someone opens it — this component
 * is not in the navigation's initial bundle.
 *
 * It searches through the provider registry rather than over a hardcoded list,
 * so Academy lessons, Setup Lab entries and Dictionary terms become searchable
 * by registering a provider, with no change here.
 *
 * Semantics are the combobox pattern: a text input owning `aria-activedescendant`
 * over a listbox, inside a modal dialog. Arrow keys move the active option
 * without moving DOM focus, which is what lets the user keep typing while
 * navigating results.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  nav: Dictionary["nav"];
}

export default function CommandPalette({ open, onClose, locale, nav }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  /**
   * Results are stored WITH the query that produced them, which makes
   * "loading" a derived value rather than a second piece of state set from an
   * effect. Two booleans describing one fact is how a spinner gets stuck on.
   */
  const [answered, setAnswered] = useState<{
    query: string;
    items: SearchResult[];
  }>({ query: "", items: [] });
  const [activeIndex, setActiveIndex] = useState(0);

  const results = answered.items;
  const loading = answered.query !== query;
  // Clamped at render: results shrink as the query narrows, and an index left
  // pointing past the end would silently disable Enter.
  const active = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useDismissableLayer({
    open,
    onDismiss: onClose,
    containerRef,
    initialFocusRef: inputRef,
  });

  const labels: SearchLabels = useMemo(
    () => ({
      pages: nav.resultsPages,
      commands: nav.resultsCommands,
      comingSoon: nav.comingSoon,
      toggleTheme: nav.cmdToggleTheme,
      switchLanguage: nav.cmdSwitchLanguage,
      scrollTop: nav.cmdScrollTop,
    }),
    [nav],
  );

  // Providers are registered while the palette is mounted and torn down with
  // it, so nothing accumulates across opens.
  useEffect(() => {
    const unregister = [
      registerSearchProvider(createNavigationProvider(nav)),
      registerSearchProvider(createCommandProvider()),
      // EPIC 04. A whole content domain became searchable by adding a file —
      // the registry doing exactly what it was built for.
      // Loaders, not data. Nothing is fetched until someone searches, and
      // nothing is serialized into any route's payload — see lib/search/lazy.ts
      // for the EPIC 04 defect this exists to prevent.
      registerSearchProvider(createConceptProvider(() => loadConceptIndex(locale))),
      registerSearchProvider(createSetupProvider(() => loadSetupIndex(locale))),
      registerSearchProvider(createAcademyProvider(() => loadAcademyIndex(locale))),
      registerSearchProvider(createDictionaryProvider(() => loadDictionaryIndex(locale))),
    ];
    return () => unregister.forEach((fn) => fn());
  }, [nav, locale]);

  // Query → results. Async because a future provider will be. State is set
  // only inside the async callback, never synchronously in the effect body,
  // and the guard stops a slow provider's stale answer landing after a newer
  // one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void searchAll(query, { locale, labels }).then((items) => {
      if (cancelled) return;
      setAnswered({ query, items });
    });

    return () => {
      cancelled = true;
    };
  }, [open, query, locale, labels]);

  // Opening is reported once per mount. The palette is remounted on open by
  // its parent, so there is no stale query to clear here.
  useEffect(() => {
    track("search_open", { surface: "command-palette", locale });
  }, [locale]);

  const runCommand = useCallback(
    (commandId: CommandId) => {
      if (commandId === "toggle-theme") {
        const next = readStoredTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        track("theme_change", { surface: "command-palette", theme: next });
      } else if (commandId === "switch-language") {
        const target = locales.find((l) => l !== locale) ?? locale;
        track("language_change", { surface: "command-palette", locale: target });
        router.push(withLocale(window.location.pathname, target));
      } else if (commandId === "scroll-top") {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }
    },
    [locale, router],
  );

  const select = useCallback(
    (result: SearchResult) => {
      track("search_select", {
        id: result.id,
        surface: "command-palette",
        queryLength: query.length,
      });
      if (result.commandId !== undefined) {
        runCommand(result.commandId);
      } else if (result.href !== undefined) {
        router.push(result.href);
      } else {
        // A planned destination: indexed so it is discoverable, but with
        // nowhere to go. Closing silently would look broken, so hold.
        return;
      }
      onClose();
    },
    [onClose, query.length, router, runCommand],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((active + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((active - 1 + results.length) % results.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[active];
      if (result !== undefined) select(result);
    }
  };

  // Keep the active option in view when arrowing past the fold.
  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  const listId = "command-palette-results";
  const activeId =
    results[active] !== undefined ? `cp-option-${results[active]?.id}` : undefined;

  return (
    <div
      className="palette-scrim"
      // Clicking the backdrop dismisses; the panel stops propagation so a
      // click inside never does.
      onMouseDown={onClose}
      dir={localeDirection[locale]}
    >
      <div
        ref={containerRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={nav.search}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-field">
          <span aria-hidden="true" className="palette-icon">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={nav.searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              track("search_query", {
                surface: "command-palette",
                queryLength: e.target.value.length,
              });
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label={nav.searchClose}
          >
            <span aria-hidden="true">esc</span>
          </button>
        </div>

        {/* Status is announced politely so a screen reader hears the result
            count change without the list stealing focus. */}
        <p className="sr-only" role="status" aria-live="polite">
          {loading ? nav.searchLoading : `${results.length} ${nav.resultsPages}`}
        </p>

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={nav.search}
          className="palette-list"
        >
          {results.map((result, index) => {
            const unreachable =
              result.href === undefined && result.commandId === undefined;
            return (
              <li
                key={result.id}
                id={`cp-option-${result.id}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={unreachable}
                data-active={index === active}
                className="palette-option"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(result)}
              >
                <span className="palette-option-title">{result.title}</span>
                {result.subtitle !== undefined ? (
                  <span className="palette-option-sub type-caption">
                    {result.subtitle}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!loading && results.length === 0 ? (
          <p className="palette-empty type-caption">
            {query === "" ? nav.searchEmpty : nav.searchNoResults}
          </p>
        ) : null}
      </div>
    </div>
  );
}
