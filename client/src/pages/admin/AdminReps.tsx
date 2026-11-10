import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronRight, MousePointerClick, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { BackLink } from "@/components/xpot/PageHeader";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { filterPeople, peopleFiltersFromParams, personStatus, type PeopleFilters, type PeopleStatus } from "./peopleFilters";
import { NewPersonForm } from "./NewPersonForm";
import { isUndecided, MODULE_KEYS, PersonDetail, PersonModules, PersonPills, PersonPlacePill, PersonStatusPill, PLATFORM_ACCESS_KEYS, REPS_KEY, ROLES, type Rep } from "./PersonDetail";
import { SellBlockerPills } from "./PersonTagsSales";

// Who may use Xpot, and everything about each person: the one place people
// are created, approved, blocked and deleted (Organizations adds people to a team). People sign up with their phone and wait here for approval; an
// admin can also create someone's access directly. The list opens a person at
// /admin/reps/:repId (beside the list on a computer, as a page on a phone), so
// other screens link straight to them. Search and filters live in the URL
// (?q=&status=&role=&module=); ?new=1 opens the create form. Everyone is one table (the app's CompactDataTable),
// waiting first; a phone gets the same people as a compact list.

const BASE = "/admin/reps";

/** Waiting first (they need a decision), then active, blocked and refused; the API's order inside each. */
const STATUS_ORDER: Record<PeopleStatus, number> = { pending: 0, active: 1, blocked: 2, refused: 3 };

export function AdminReps() {
  const query = useQuery<Rep[]>({ queryKey: REPS_KEY });
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const tc = useT(commonMessages);
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const [match, params] = useRoute(`${BASE}/:repId`);
  const selectedId = match && /^\d+$/.test(params.repId) ? Number(params.repId) : null;
  const urlFilters = useUrlFilters({ q: "", status: "", role: "", module: "", new: "" });
  const filters = peopleFiltersFromParams(urlFilters.values);
  const setFilters = (next: PeopleFilters) =>
    urlFilters.set({ q: next.search, status: next.status === "all" ? "" : next.status, role: next.role === "all" ? "" : next.role, module: next.module === "all" ? "" : next.module });
  const filtersKey = JSON.stringify(filters);
  const filtering = filters.search.trim() !== "" || filters.status !== "all" || filters.role !== "all" || filters.module !== "all";
  const people = filterPeople(query.data ?? [], filters)
    .map((rep, index) => ({ rep, index }))
    .sort((a, b) => STATUS_ORDER[personStatus(a.rep)] - STATUS_ORDER[personStatus(b.rep)] || a.index - b.index)
    .map(({ rep }) => rep);
  // One table a page at a time, keeping the open person on it.
  const page = usePagedList(people, { resetKey: filtersKey, keepIndex: selectedId == null ? -1 : people.findIndex((r) => r.id === selectedId) });
  const selected = selectedId == null ? null : (query.data ?? []).find((r) => r.id === selectedId) ?? null;

  // Opening and closing keep the filters (the query string rides along).
  const open = (rep: Rep) => navigate(`${BASE}/${rep.id}${currentSearch()}`, { replace: selectedId != null });
  const close = () => navigate(`${BASE}${currentSearch()}`, { replace: true });

  if (query.isLoading) return <ListSkeleton rows={5} />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("repsLoadFailed")} onRetry={() => void query.refetch()} />;
  }

  const notFound = <EmptyState compact icon={Users} title={tw("personNotFound")} />;

  // A phone shows the person as a page of its own, with the way back to the list.
  if (!isDesktop && selectedId != null) {
    return (
      <div className="space-y-3">
        <BackLink onBack={close}>{tw("backToPeople")}</BackLink>
        {selected ? <PersonDetail rep={selected} onGone={close} /> : notFound}
      </div>
    );
  }

  const columns: CompactDataColumn<Rep>[] = [
    {
      key: "person",
      label: tw("columnPerson"),
      render: (rep) => (
        <span className="block min-w-0">
          <strong className="block truncate text-sm font-semibold text-white/90">{rep.displayName}</strong>
          <span className="mt-0.5 block truncate text-[11px] text-white/40">
            {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">{t("noSignInPhone")}</span>}
            {rep.email ? ` · ${rep.email}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      label: t("filterStatus"),
      width: 210,
      render: (rep) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <PersonStatusPill rep={rep} />
          {/* Only an approved person with Tags: what stops them selling (blocked is already the status pill). */}
          {rep.access === "active" && repModules(rep).includes("tags") && <SellBlockerPills rep={rep} />}
        </span>
      ),
    },
    {
      key: "place",
      label: tw("columnOrganization"),
      width: 230,
      render: (rep) => (isUndecided(rep) ? null : <PersonPlacePill rep={rep} />),
    },
    {
      key: "modules",
      label: tw("columnModules"),
      width: 130,
      render: (rep) => (isUndecided(rep) ? null : <PersonModules rep={rep} />),
    },
    {
      key: "open",
      label: <span className="sr-only">{tw("columnPerson")}</span>,
      width: 44,
      align: "right",
      render: () => <ChevronRight className="ml-auto h-4 w-4 text-white/20" aria-hidden="true" />,
    },
  ];
  // Beside the detail pane the list is narrow: the person and where they stand are enough to pick the next one.
  const shownColumns = selectedId == null ? columns : columns.filter((column) => column.key === "person" || column.key === "status");

  const list = people.length === 0 ? (
    filtering ? <EmptyState compact icon={Users} title={t("noPeopleMatch")} /> : <EmptyState compact dense icon={Users} title={t("noActivePeople")} />
  ) : (
    <div data-testid="reps-list">
      <CompactDataTable
        columns={shownColumns}
        rows={page.visible}
        getRowKey={(rep) => rep.id}
        onRowClick={open}
        selectedKey={selectedId}
        getRowAriaLabel={(rep) => tw("openPerson", { name: rep.displayName })}
        getRowClassName={(rep) => ROW_TINT[personStatus(rep)]}
        getRowTestId={(rep) => `rep-${rep.id}`}
        className="hidden sm:block"
        testId="reps-table"
      />
      <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl sm:hidden ${GLASS_CLASS}`}>
        {page.visible.map((rep) => <PersonRow key={rep.id} rep={rep} selected={rep.id === selectedId} onOpen={() => open(rep)} />)}
      </div>
      <ListPager shown={page.shown} total={page.total} hasMore={page.hasMore} onMore={page.showMore} />
    </div>
  );

  return (
    <div className="space-y-4">
      <NewPersonForm
        initiallyOpen={urlFilters.values.new === "1"}
        onClosed={() => urlFilters.values.new && urlFilters.set({ new: "" })}
        onCreated={(rep) => navigate(`${BASE}/${rep.id}`)}
      />
      <PeopleToolbar value={filters} onChange={setFilters} active={filtering} shown={people.length} total={query.data.length} />
      {isDesktop ? (
        <MasterDetail
          bareWhenEmpty
          closeLabel={tc("close")}
          onClose={close}
          list={list}
          detail={selectedId == null ? null : selected ? <PersonDetail key={selected.id} rep={selected} onClose={close} onGone={close} /> : notFound}
          placeholder={<EmptyState icon={MousePointerClick} title={tw("pickPerson")} hint={tw("pickPersonHint")} />}
        />
      ) : (
        list
      )}
    </div>
  );
}

/** Waiting for a decision stands out; blocked and refused step back. */
const ROW_TINT: Record<PeopleStatus, string> = {
  pending: "bg-amber-400/[0.04]",
  active: "",
  blocked: "opacity-60",
  refused: "opacity-50",
};

/** One person in the list: name and phone, where they stand, role and modules; opens their detail. */
function PersonRow({ rep, selected, onOpen }: { rep: Rep; selected: boolean; onOpen: () => void }) {
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      aria-label={tw("openPerson", { name: rep.displayName })}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors focus-visible:!-outline-offset-2 ${selected ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}
      data-testid={`rep-${rep.id}`}
    >
      {/* Wide enough to read the name: on a phone the pills wrap below it instead. */}
      <span className="min-w-[10rem] flex-1">
        <span className="block truncate font-medium text-white">{rep.displayName}</span>
        <span className="block truncate text-xs text-white/40">
          {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">{t("noSignInPhone")}</span>}
          {rep.email ? ` · ${rep.email}` : ""}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <PersonPills rep={rep} />
        {/* Only an approved person with Tags: what stops them selling (blocked is already the status pill). */}
        {rep.access === "active" && repModules(rep).includes("tags") && <SellBlockerPills rep={rep} />}
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-white/25 sm:block" aria-hidden="true" />
    </button>
  );
}

/** Search box and the status, role and module filters ("" in a select is "all"). */
function PeopleToolbar({ value, onChange, active, shown, total }: { value: PeopleFilters; onChange: (next: PeopleFilters) => void; active: boolean; shown: number; total: number }) {
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isDesktop = useIsDesktop();
  // On a phone the three filters wait behind one button, so the first person is not a screen away.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showControls = isDesktop || filtersOpen || active;
  const set = <K extends keyof PeopleFilters>(key: K, v: PeopleFilters[K]) => onChange({ ...value, [key]: v });
  const fromSelect = <V extends string>(v: string) => (v || "all") as V | "all";
  const toSelect = (v: string) => (v === "all" ? "" : v);
  return (
    <FilterBar
      testId="people-toolbar"
      search={<FilterSearch value={value.search} onChange={(v) => set("search", v)} placeholder={t("searchPeople")} testId="people-search" />}
      actions={isDesktop ? undefined : <FilterToggle pressed={showControls} onChange={setFiltersOpen} label={tw("filters")} testId="people-filters-toggle" />}
      controls={!showControls ? undefined : (
        <>
          <FilterSelect
            value={toSelect(value.status)}
            onChange={(v) => set("status", fromSelect(v))}
            placeholder={`${t("filterStatus")}: ${t("filterAll")}`}
            options={(["pending", "active", "blocked", "refused"] as const).map((s) => ({ value: s, label: t(`status_${s}`) }))}
            testId="people-filter-status"
          />
          <FilterSelect
            value={toSelect(value.role)}
            onChange={(v) => set("role", fromSelect(v))}
            placeholder={`${tw("platformAccessFilter")}: ${t("filterAll")}`}
            options={ROLES.map((r) => ({ value: r, label: tw(PLATFORM_ACCESS_KEYS[r]) }))}
          />
          <FilterSelect
            value={toSelect(value.module)}
            onChange={(v) => set("module", fromSelect(v))}
            placeholder={`${t("filterModule")}: ${t("filterAll")}`}
            options={XPOT_MODULES.map((m: XpotModule) => ({ value: m, label: tc(MODULE_KEYS[m]) }))}
          />
        </>
      )}
      summary={{ active, shown, total, onClear: () => onChange({ search: "", status: "all", role: "all", module: "all" }) }}
    />
  );
}
