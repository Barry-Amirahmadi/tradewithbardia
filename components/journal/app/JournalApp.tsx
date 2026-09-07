"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AnalyticsView from "./AnalyticsView";
import DashboardView from "./DashboardView";
import ReviewView from "./ReviewView";
import TradesView from "./TradesView";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { demoTrades } from "@/lib/journal/demo-data";
import { LocalTradeRepository, type TradeRepository } from "@/lib/journal/repository";
import type { StoredTrade, Trade } from "@/lib/journal/trade";
import { appViews, type AppView } from "@/lib/journal/views";

/**
 * THE APPLICATION SHELL — master prompt §14, §15, §24, §25, §31.
 *
 * ARCHITECTURE DECISION: the application is **client-only**.
 *
 * The site is statically exported with `dynamicParams = false`. Conventional
 * server-authenticated `/app/*` routes would need a server that renders
 * per-user HTML, which means a backend and real authentication — both
 * explicitly out of scope. Three consequences follow, and all three are
 * desirable:
 *
 * 1. **The route is an empty shell.** Every `/app/*` page prerenders to markup
 *    containing no records at all; the data arrives in the browser from the
 *    repository. Private data therefore *cannot* leak into a static payload,
 *    an RSC payload or an SEO crawl — the boundary is structural, not a rule
 *    someone has to remember (§24, §42).
 * 2. **A trade is addressed by URL fragment**, not a path segment. A fragment
 *    is never sent to a server, never appears in a log, and never needs a
 *    prerendered route per record. `#trade=demo-03` is both the privacy-safe
 *    and the static-export-compatible answer.
 * 3. **There is no authentication, and the UI says so.** No fake session, no
 *    "signed in as", no client-side identity pretending to be authorization
 *    (§25). When a real backend exists, `TradeRepository` gains a server
 *    implementation and this component does not change.
 */

interface Props {
  locale: Locale;
  view: AppView;
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: Dictionary["lab"];
  dict: Dictionary["dict"];
}

export default function JournalApp({ locale, view, journal, concepts, lab, dict }: Props) {
  const app = journal.app;

  // One repository for the session. Seeded with demo records the first time;
  // afterwards whatever the browser holds. Swapping this line for a server
  // implementation is the entire migration path.
  const repository = useMemo<TradeRepository>(
    () => new LocalTradeRepository(demoTrades),
    [],
  );

  const [trades, setTrades] = useState<readonly StoredTrade[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void repository.list().then(setTrades);
  }, [repository]);

  useEffect(() => {
    refresh();
    return repository.subscribe(refresh);
  }, [repository, refresh]);

  useEffect(() => {
    track("journal_app_view", { surface: "journal-app", id: `view.${view}` });
  }, [view]);

  // Selection lives in the fragment so a trade can be linked to without the
  // id ever reaching a server. Back/forward work for free.
  useEffect(() => {
    const read = () => {
      const match = /(?:^|[#&])trade=([^&]+)/.exec(window.location.hash);
      setSelected(match?.[1] ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const select = useCallback((id: string | null) => {
    // `replaceState` rather than assigning `location.hash`, so opening and
    // closing a trade does not fill the history stack with fragments.
    const url = new URL(window.location.href);
    url.hash = id === null ? "" : `trade=${id}`;
    window.history.replaceState(null, "", url.toString());
    setSelected(id);
    if (id !== null) track("journal_trade_open", { surface: "journal-app", id: `trade.${id}` });
  }, []);

  const saveReview = useCallback(
    async (id: string, review: NonNullable<Trade["review"]>) => {
      await repository.update(id, { review });
      track("journal_review_save", { surface: "journal-app", id: `trade.${id}` });
    },
    [repository],
  );

  const reset = useCallback(async () => {
    for (const trade of await repository.list()) await repository.remove(trade.id);
    for (const trade of demoTrades) await repository.create(trade);
  }, [repository]);

  return (
    <div className="japp">
      {/*
        Stated once, at the top, and never contradicted anywhere below. A user
        must never be in doubt about whether they are looking at demo data or
        their own, or about where it is stored (§6, §16).
      */}
      <p className="japp-banner" role="status">
        <span className="japp-banner-tag type-label">{journal.demoLabel}</span>
        <span className="type-caption">{app.demoBanner}</span>
      </p>

      <header className="japp-header">
        <div>
          <h1 className="type-h2">{app.title}</h1>
          <p className="type-caption text-muted">{app.notSignedIn}</p>
        </div>
        <div className="japp-header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void reset()}>
            {app.reset}
          </button>
          <Link href={`/${locale}/journal`} className="btn btn-ghost">
            {app.backToJournal}
          </Link>
        </div>
      </header>

      <nav className="japp-nav" aria-label={app.title}>
        {appViews.map((id) => (
          <Link
            key={id}
            href={`/${locale}/app/${id}`}
            className="japp-nav-link"
            aria-current={id === view ? "page" : undefined}
          >
            {app.nav[id]}
          </Link>
        ))}
      </nav>

      <div className="japp-body">
        {view === "dashboard" ? (
          <DashboardView
            locale={locale} trades={trades} journal={journal}
            concepts={concepts} lab={lab} onSelect={select}
          />
        ) : null}
        {view === "trades" ? (
          <TradesView
            locale={locale} trades={trades} journal={journal} concepts={concepts}
            lab={lab} dict={dict} selected={selected} onSelect={select}
          />
        ) : null}
        {view === "review" ? (
          <ReviewView
            locale={locale} trades={trades} journal={journal}
            concepts={concepts} onSave={saveReview}
          />
        ) : null}
        {view === "analytics" ? (
          <AnalyticsView
            locale={locale} trades={trades} journal={journal}
            concepts={concepts} lab={lab}
          />
        ) : null}
      </div>
    </div>
  );
}
