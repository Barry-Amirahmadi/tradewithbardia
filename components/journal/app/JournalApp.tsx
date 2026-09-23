"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AnalyticsView from "./AnalyticsView";
import DashboardView from "./DashboardView";
import ReviewView from "./ReviewView";
import SettingsView from "./SettingsView";
import TradeForm from "./TradeForm";
import TradesView from "./TradesView";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { storageMode } from "@/lib/journal/analytics";
import { demoTrades } from "@/lib/journal/demo-data";
import {
  draftFromTrade,
  emptyDraft,
  newTradeId,
  parseDraft,
  type TradeDraft,
} from "@/lib/journal/draft";
import { parseFragment, serializeFragment, type TradeMode } from "@/lib/journal/fragment";
import type { JournalLab } from "@/lib/journal/lab-view";
import type { MigrationResult } from "@/lib/journal/migration";
import { LocalTradeRepository, type TradeRepository } from "@/lib/journal/repository";
import type { StoredTrade, Trade, ValidationIssue } from "@/lib/journal/trade";
import { appViews, type AppMode, type AppView } from "@/lib/journal/views";

/**
 * THE APPLICATION SHELL — master prompt §21, §28, §33, §34, §35, §36.
 *
 * ARCHITECTURE DECISION, UNCHANGED FROM EPIC 08: the application is
 * **client-only**, and EPIC 09 did not weaken it.
 *
 * The site is statically exported with `dynamicParams = false`. Conventional
 * server-authenticated `/app/*` routes would need a server rendering per-user
 * HTML — a backend and real authentication, both out of scope. Three
 * consequences follow, and all three are desirable:
 *
 * 1. **Every route prerenders empty.** Records arrive in the browser from the
 *    repository, so private data *cannot* leak into a static payload, an RSC
 *    payload or an SEO crawl. Structural, not a rule to remember (§33).
 * 2. **A trade is addressed by URL fragment** (§34). Never a path segment,
 *    never a generated static route per record. Creating a trade is the one
 *    exception that gets a real route — `/app/trades/new` contains no id
 *    because a trade being created does not have one yet.
 * 3. **There is no authentication, and the UI says so** — no session, no
 *    "signed in as", no client-side identity pretending to be authorization.
 *
 * ONE REPOSITORY, ONE ANALYTICS ENGINE (§21, §28). Every mutation goes through
 * `repository`, the repository notifies, `trades` is re-read, and every metric
 * in the application recomputes from that array. No component patches a
 * number, and no component reaches browser storage directly — the repository
 * is the only module that names it, and a test enforces that. Which is why
 * adding a trade changes the dashboard without a line of code connecting the
 * two.
 */

interface Props {
  locale: Locale;
  view: AppView;
  mode: AppMode;
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: JournalLab;
  dict: Dictionary["dict"];
}

export default function JournalApp({ locale, view, mode, journal, concepts, lab, dict }: Props) {
  const app = journal.app;
  const router = useRouter();

  // One repository for the lifetime of the page. Seeded with demo records on a first
  // visit; afterwards whatever the browser holds. Swapping this line for a
  // server implementation is the entire migration path.
  const repository = useMemo<TradeRepository>(
    () => new LocalTradeRepository(demoTrades),
    [],
  );

  const [trades, setTrades] = useState<readonly StoredTrade[]>([]);
  /**
   * "Not read yet" is not the same state as "no trades" — EPIC 10 §23, §24.
   *
   * Without this the shell rendered its empty state on the first frame and
   * then swapped in the real records, which is both a lie to anyone who has
   * forty trades and a measured layout shift: **CLS 0.375 on `/fa/app/trades`
   * and 0.068 on `/en/app/dashboard`** before the fix, against 0 on every
   * public route. The skeleton below reserves the space instead.
   *
   * This is the cost of the client-only architecture, paid honestly. The shell
   * cannot server-render records — that is the privacy boundary working — so
   * the one frame before storage answers has to be designed rather than
   * stumbled through.
   */
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("view");
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void repository.list().then((rows) => {
      setTrades(rows);
      setReady(true);
    });
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
      const state = parseFragment(window.location.hash);
      setSelected(state.tradeId);
      setTradeMode(state.mode);
      if (state.saved) {
        setNotice(app.capture.created);
        // Consume the flag immediately: the confirmation describes something
        // that just happened, and a reload an hour later must not repeat it.
        const url = new URL(window.location.href);
        url.hash = serializeFragment({ ...state, saved: false });
        window.history.replaceState(null, "", url.toString());
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [app]);

  const address = useCallback((id: string | null, next: TradeMode = "view") => {
    // `replaceState` rather than assigning `location.hash`, so opening and
    // closing a trade does not fill the history stack with fragments.
    const url = new URL(window.location.href);
    url.hash = serializeFragment({ tradeId: id, mode: next, saved: false });
    window.history.replaceState(null, "", url.toString());
    setSelected(id);
    setTradeMode(next);
    setIssues([]);
    if (id !== null && next === "view") {
      track("journal_trade_open", { surface: "journal-app", id: `trade.${id}` });
    }
  }, []);

  const saveReview = useCallback(
    async (id: string, review: NonNullable<Trade["review"]>) => {
      await repository.update(id, { review });
      track("journal_review_save", { surface: "journal-app", id: `trade.${id}` });
    },
    [repository],
  );

  /**
   * Create or update, through the one validation path.
   *
   * `parseDraft` runs the same domain rules the repository enforces, so a
   * trade cannot be made invalid by being edited (§6) — and the review is
   * carried through explicitly, because changing an exit price must not
   * silently discard the reflection attached to that trade.
   */
  const submit = useCallback(
    (draft: TradeDraft) => {
      const existing = selected === null ? undefined : trades.find((t) => t.id === selected);
      const editing = tradeMode === "edit" && existing !== undefined;

      const result = parseDraft(draft, {
        id: editing ? existing.id : newTradeId(),
        origin: editing ? existing.origin : "user",
        ...(editing && existing.review !== undefined ? { review: existing.review } : {}),
      });

      if (!result.ok) {
        setIssues(result.issues);
        return;
      }
      setIssues([]);

      void (async () => {
        if (editing) {
          await repository.update(existing.id, result.trade);
          track("journal_trade_update", { surface: "journal-app", id: `trade.${existing.id}` });
          setNotice(app.capture.updated);
          address(existing.id, "view");
        } else {
          await repository.create(result.trade);
          track("journal_trade_create", { surface: "journal-app", id: `trade.${result.trade.id}` });
          // Land on the saved record rather than an empty list, so the user
          // can see what was actually stored. The confirmation rides in the
          // fragment because this navigation remounts the shell.
          router.push(
            `/${locale}/app/trades${serializeFragment({
              tradeId: result.trade.id, mode: "view", saved: true,
            })}`,
          );
        }
      })();
    },
    [selected, trades, tradeMode, repository, address, router, locale, app],
  );

  const remove = useCallback(
    async (id: string) => {
      await repository.remove(id);
      track("journal_trade_delete", { surface: "journal-app", id: `trade.${id}` });
      setNotice(app.actions.deleted);
      address(null);
    },
    [repository, address, app],
  );

  const reset = useCallback(async () => {
    for (const trade of await repository.list()) await repository.remove(trade.id);
    for (const trade of demoTrades) await repository.create(trade);
  }, [repository]);

  const deleteAll = useCallback(async () => {
    for (const trade of await repository.list()) await repository.remove(trade.id);
  }, [repository]);

  const mine = storageMode(trades);
  const migration: MigrationResult | null =
    repository instanceof LocalTradeRepository ? repository.migration : null;

  const capturing = mode === "new" || (view === "trades" && tradeMode === "edit");
  const editing = view === "trades" && tradeMode === "edit";
  const editTarget = selected === null ? undefined : trades.find((t) => t.id === selected);

  return (
    <div className="japp">
      {/*
        Stated once, at the top, and never contradicted anywhere below. A user
        must never be in doubt about whether they are looking at demo data or
        their own, or about where it is stored (§27, §50). The label is derived
        from the records themselves, so adding a trade changes it.
      */}
      <p className="japp-banner" role="status">
        <span className="japp-banner-tag type-label">{app.storage[mine]}</span>
        <span className="type-caption">{app.storageNote[mine]}</span>
      </p>

      <header className="japp-header">
        <div>
          <h1 className="type-h2">{app.title}</h1>
          <p className="type-caption text-muted">{app.notSignedIn}</p>
        </div>
        <div className="japp-header-actions">
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
            aria-current={id === view && !capturing ? "page" : undefined}
          >
            {app.nav[id]}
          </Link>
        ))}
      </nav>

      {/* One live region for every write, so a save, an edit and a delete all
          announce themselves the same way. */}
      {notice !== null ? (
        <p className="japp-saved type-caption" role="status">{notice}</p>
      ) : null}

      <div className="japp-body">
        {!ready ? (
          /* Reserves the body's height so the real view does not push the page
             when it arrives. `aria-busy` tells assistive technology that this
             is a pending region rather than empty content, and the skeleton
             carries no animation of its own — the reduced-motion rule applies
             to loading states too (§24). */
          <div className="japp-skeleton" role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">{app.loading}</span>
            <span className="japp-skeleton-bar" />
            <span className="japp-skeleton-bar" />
            <span className="japp-skeleton-bar" />
          </div>
        ) : capturing ? (
          <TradeForm
            mode={editing ? "edit" : "create"}
            initial={
              editing && editTarget !== undefined ? draftFromTrade(editTarget) : emptyDraft()
            }
            issues={issues}
            locale={locale}
            journal={journal}
            lab={lab}
            concepts={concepts}
            onSubmit={submit}
            onCancel={() => {
              setIssues([]);
              if (editing) address(selected, "view");
              else router.push(`/${locale}/app/trades`);
            }}
          />
        ) : (
          <>
            {view === "dashboard" ? (
              <DashboardView
                locale={locale} trades={trades} journal={journal}
                concepts={concepts} lab={lab} onSelect={(id) => address(id)}
              />
            ) : null}
            {view === "trades" ? (
              <TradesView
                locale={locale} trades={trades} journal={journal} concepts={concepts}
                lab={lab} dict={dict} selected={selected}
                onSelect={(id) => address(id)}
                onEdit={(id) => address(id, "edit")}
                onReview={(id) =>
                  router.push(
                    `/${locale}/app/review${serializeFragment({
                      tradeId: id, mode: "review", saved: false,
                    })}`,
                  )
                }
                onDelete={remove}
                onCreate={() => router.push(`/${locale}/app/trades/new`)}
              />
            ) : null}
            {view === "review" ? (
              <ReviewView
                locale={locale} trades={trades} journal={journal}
                concepts={concepts} initialTradeId={selected} onSave={saveReview}
              />
            ) : null}
            {view === "analytics" ? (
              <AnalyticsView
                locale={locale} trades={trades} journal={journal}
                concepts={concepts} lab={lab}
              />
            ) : null}
            {view === "settings" ? (
              <SettingsView
                locale={locale} trades={trades} journal={journal}
                migration={migration} onReset={reset} onDeleteAll={deleteAll}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
