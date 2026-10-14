import { useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, ChevronRight, Package, Radio, ScanLine } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { FilterBar, FilterSearch } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import type { FullSalesLead } from "@/pages/xpot/types";
import { APP_BASE, errorText } from "./lib";
import { CARD, Spinner, TopBar } from "./ui";

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
  const filters = useUrlFilters({ q: "" });
  const search = filters.values.q;
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
  const paged = usePagedList(filtered, { resetKey: query });
  const totals = useMemo(
    () => customers.reduce((sum, customer) => ({ pieces: sum.pieces + customer.pieces, live: sum.live + customer.live, scans: sum.scans + customer.scansLast30 }), { pieces: 0, live: 0, scans: 0 }),
    [customers],
  );
  const number = useMemo(() => new Intl.NumberFormat(t.locale), [t.locale]);
  const loading = (leadsQuery.isLoading && !leadsQuery.data) || (summariesQuery.isLoading && !summariesQuery.data);
  const error = leadsQuery.error || summariesQuery.error;

  const openCustomer = (customer: Customer) => navigate(`${APP_BASE}/customers/${customer.leadId}`);
  const columns: CompactDataColumn<Customer>[] = [
    {
      key: "customer",
      label: t("customerCompany"),
      render: (customer) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-violet-500/[0.1] text-violet-300/80">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-semibold text-white/90">{customer.name}</strong>
            <span className="mt-0.5 block truncate text-[11px] text-white/35">{customer.detail || t.plural("pieces", customer.pieces)}</span>
          </span>
        </div>
      ),
    },
    {
      key: "pieces",
      label: t("customersPieces"),
      width: 120,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (customer) => <span className="font-semibold tabular-nums text-white/70">{number.format(customer.pieces)}</span>,
    },
    {
      key: "live",
      label: t("customersLive"),
      width: 120,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (customer) => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/[0.08] px-2 py-1 text-xs font-semibold tabular-nums text-emerald-300/85">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          {number.format(customer.live)}
        </span>
      ),
    },
    {
      key: "scans",
      label: t("customersScans30"),
      width: 160,
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (customer) => <span className="font-semibold tabular-nums text-white/75">{number.format(customer.scansLast30)}</span>,
    },
    {
      key: "action",
      label: <span className="sr-only">{t("customersViewPieces")}</span>,
      width: 48,
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: () => <ChevronRight className="ml-auto h-4 w-4 text-white/20" aria-hidden="true" />,
    },
  ];

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

          <FilterBar
            className="mt-4"
            testId="customers-filters"
            search={<FilterSearch value={search} onChange={(q) => filters.set({ q })} placeholder={t("customersSearch")} testId="input-customer-search" />}
            summary={{ shown: filtered.length, total: customers.length, active: Boolean(query), onClear: () => filters.reset() }}
          />

          {filtered.length ? (
            <div className="mt-4">
              <CompactDataTable
                columns={columns}
                rows={paged.visible}
                getRowKey={(customer) => customer.leadId}
                onRowClick={openCustomer}
                getRowAriaLabel={(customer) => `${customer.name}, ${t("customersViewPieces")}`}
                className="hidden sm:block"
                testId="customers-table"
              />

              <div className="divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] sm:hidden">
                {paged.visible.map((customer) => (
                  <button
                    key={customer.leadId}
                    type="button"
                    onClick={() => openCustomer(customer)}
                    className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-white/[0.05]"
                    aria-label={`${customer.name}, ${t("customersViewPieces")}`}
                    data-testid={`customer-card-${customer.leadId}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/[0.1] text-violet-300/80">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-semibold text-white/90">{customer.name}</strong>
                      <span className="mt-1 block truncate text-[11px] text-white/38">
                        {t.plural("pieces", customer.pieces)} · {number.format(customer.live)} {t("customersLive").toLocaleLowerCase(t.locale)} · {number.format(customer.scansLast30)} {t("customersScans30").toLocaleLowerCase(t.locale)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/20 transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} />
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
