import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BarChart3, Check, ChevronRight, PackageOpen, Pause, TriangleAlert, type LucideIcon } from "lucide-react";
import { resellerTodo } from "@shared/tagApp";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { ErrorState } from "@/components/xpot/EmptyState";
import { useViewerAccess } from "@/lib/adminMode";
import { FirstSteps } from "./FirstSteps";
import { APP_BASE, errorText, myPiecesQuery } from "./lib";
import { CARD, EYEBROW_MUTED } from "./ui";

// What a reseller does next, under "Read a piece" on Home: the pieces waiting for them, one row per kind, each
// opening the list already filtered; or one line saying nothing is. The numbers come from the same list as
// "My pieces" (lib.ts myPiecesQuery), through resellerTodo, so a row always opens as many pieces as it counted.
// Results (scans, top pieces and customers) sit one link away: they are a report, not a task.

function Row({ icon: Icon, tone, title, hint, to, testId }: { icon: LucideIcon; tone: "amber" | "neutral"; title: string; hint?: ReactNode; to: string; testId: string }) {
  const [, navigate] = useLocation();
  return (
    <li>
      <button type="button" onClick={() => navigate(to)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10" data-testid={testId}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === "amber" ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.06] text-white/60"}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {hint && <span className="mt-0.5 block text-xs text-white/50">{hint}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
      </button>
    </li>
  );
}

export function TagsTodo() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const { data, error, refetch } = useQuery(myPiecesQuery());
  const { reach } = useViewerAccess();
  const todo = data ? resellerTodo(data) : null;
  const pending = todo ? todo.finish + todo.noCustomer + todo.paused : 0;

  return (
    <div className="space-y-3" data-testid="tags-todo">
      {error && !data ? (
        <ErrorState message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
      ) : todo && data && data.length > 0 ? (
        <section>
          <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{t("todoTitle")}</h2>
          {pending === 0 ? (
            <p className={`${CARD} flex items-center gap-3 px-4 py-4 text-sm font-semibold text-white`} data-testid="todo-all-live">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <Check className="h-[18px] w-[18px]" />
              </span>
              {t("todoAllLive")}
            </p>
          ) : (
            <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
              {todo.finish > 0 && <Row icon={TriangleAlert} tone="amber" title={t.plural("todoFinish", todo.finish)} hint={t("todoFinishHint")} to={`${APP_BASE}/pieces?status=finish`} testId="todo-finish" />}
              {todo.noCustomer > 0 && <Row icon={PackageOpen} tone="neutral" title={t.plural("todoNoCustomer", todo.noCustomer)} to={`${APP_BASE}/pieces?status=setup`} testId="todo-no-customer" />}
              {todo.paused > 0 && <Row icon={Pause} tone="neutral" title={t.plural("todoPaused", todo.paused)} to={`${APP_BASE}/pieces?status=off`} testId="todo-paused" />}
            </ul>
          )}
        </section>
      ) : data ? (
        // Nothing in hand yet (a new reseller): what to do first, and there are no results to see. Whoever manages hands pieces out from Stock.
        reach ? null : <FirstSteps />
      ) : null}
      {data && data.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(`${APP_BASE}/results`)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white/60 active:bg-white/10"
          data-testid="see-results"
        >
          <BarChart3 className="h-4 w-4" />
          {t("seeResults")}
        </button>
      )}
    </div>
  );
}
