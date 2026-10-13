import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowRight, Building2, Package, Radio, ScanLine, Search } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import type { FullSalesLead } from "@/pages/xpot/types";
import { APP_BASE, errorText } from "./lib";
import { CARD, INPUT, Spinner, TopBar } from "./ui";

type Customer = LeadTagSummary & {
  name: string;
  detail: string | null;
  searchText: string;
};

function Metric({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: string; label: string }) {
  return (
    <div className={`${CARD} min-w-0 px-4 py-3.5`}>
      <div className="flex items-center gap-2 text-violet-300">
        <Icon className="h-4 w-4 shrink-0" />
        <strong className="truncate text-xl font-extrabold tracking-tight text-white">{value}</strong>
      </div>
      <p className="mt-1 truncate text-xs font-medium text-white/40">{label}</p>
    </div>
  );
}

/** Customers who own at least one of the signed-in reseller's Tags pieces. */
export default function CustomersScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const leadsQuery = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], staleTime: 60_000 });
  const summariesQuery = useQuery<LeadTagSummary[]>({ queryKey: ["/api/xpot/tags/by-lead"], staleTime: 15_000 });

  const customers = useMemo<Customer[]>(() => {
    const leads = new Map((leadsQuery.data ?? []).map((lead) => [lead.id, lead]));
    return (summariesQuery.data ?? [])
      .filter((summary) => summary.pieces > 0)
      .map((summary) => {
        const lead = leads.get(summary.leadId);
        const location = lead?.locations?.[0];
        const place = [location?.city, location?.state].filter(Boolean).join(", ");
        const detail = place || lead?.industry || lead?.phone || null;
        const name = lead?.name || t("customerFallback", { id: summary.leadId });
        return {
          ...summary,
          name,
          detail,
          searchText: [name, place, lead?.industry, lead?.phone].filter(Boolean).join(" ").toLocaleLowerCase(),
        };
      })
      .sort((a, b) => b.scansLast30 - a.scansLast30 || b.pieces - a.pieces || a.name.localeCompare(b.name));
  }, [leadsQuery.data, summariesQuery.data, t]);

  const query = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => (query ? customers.filter((customer) => customer.searchText.includes(query)) : customers), [customers, query]);
  const totals = useMemo(
    () => customers.reduce((sum, customer) => ({ pieces: sum.pieces + customer.pieces, live: sum.live + customer.live, scans: sum.scans + customer.scansLast30 }), { pieces: 0, live: 0, scans: 0 }),
    [customers],
  );
  const number = useMemo(() => new Intl.NumberFormat(t.locale), [t.locale]);
  const loading = (leadsQuery.isLoading && !leadsQuery.data) || (summariesQuery.isLoading && !summariesQuery.data);
  const error = leadsQuery.error || summariesQuery.error;

  const openCustomer = (customer: Customer) => {
    const params = new URLSearchParams({ lead: String(customer.leadId), name: customer.name });
    navigate(`${APP_BASE}/pieces?${params.toString()}`);
  };

  return (
    <section data-testid="tags-customers-screen">
      <div className="lg:hidden">
        <TopBar title={t("customersTitle")} eyebrow={!loading ? t.plural("customersCount", customers.length) : undefined} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-white/40">
          <Spinner className="h-7 w-7" />
        </div>
      ) : error ? (
        <div className={`${CARD} px-6 py-10 text-center text-sm text-red-200`}>{errorText(error, tc("requestFailed"))}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Metric icon={Building2} value={number.format(customers.length)} label={t("customersTitle")} />
            <Metric icon={Package} value={number.format(totals.pieces)} label={t("customersPieces")} />
            <Metric icon={Radio} value={number.format(totals.live)} label={t("customersLive")} />
            <Metric icon={ScanLine} value={number.format(totals.scans)} label={t("customersScans30")} />
          </div>

          <div className="relative mt-4 lg:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("customersSearch")}
              aria-label={t("customersSearch")}
              className={`${INPUT} pl-10`}
              data-testid="input-customer-search"
            />
          </div>

          {filtered.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((customer) => (
                <button
                  key={customer.leadId}
                  type="button"
                  onClick={() => openCustomer(customer)}
                  className={`${CARD} group min-w-0 p-4 text-left transition-colors hover:border-violet-400/30 hover:bg-white/[0.06] active:bg-white/[0.08]`}
                  aria-label={`${customer.name}, ${t("customersViewPieces")}`}
                  data-testid={`customer-card-${customer.leadId}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base font-bold tracking-tight text-white">{customer.name}</strong>
                      <span className="mt-0.5 block truncate text-sm text-white/40">{customer.detail || t.plural("pieces", customer.pieces)}</span>
                    </span>
                    <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300" />
                  </div>

                  <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-black/15 py-2.5">
                    <span className="px-2 text-center">
                      <strong className="block text-sm font-bold text-white">{number.format(customer.pieces)}</strong>
                      <span className="block truncate text-[10px] font-medium text-white/35">{t("customersPieces")}</span>
                    </span>
                    <span className="px-2 text-center">
                      <strong className="block text-sm font-bold text-white">{number.format(customer.live)}</strong>
                      <span className="block truncate text-[10px] font-medium text-white/35">{t("customersLive")}</span>
                    </span>
                    <span className="px-2 text-center">
                      <strong className="block text-sm font-bold text-white">{number.format(customer.scansLast30)}</strong>
                      <span className="block truncate text-[10px] font-medium text-white/35">{t("customersScans30")}</span>
                    </span>
                  </div>

                  <span className="mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold text-violet-300">
                    {t("customersViewPieces")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={`${CARD} mt-4 flex flex-col items-center px-6 py-12 text-center`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300/70">
                <Building2 className="h-6 w-6" />
              </span>
              <p className="mt-3 text-base font-bold text-white">{customers.length ? t("customersNoMatch") : t("customersEmpty")}</p>
              {!customers.length && <p className="mt-1 max-w-sm text-sm text-white/40">{t("customersEmptyHint")}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
