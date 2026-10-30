import { useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronRight, MousePointerClick, UserPlus, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/xpot/filters";
import { FormFooter } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { BackLink } from "@/components/xpot/PageHeader";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { settingsMessages } from "@/i18n/messages/settings";
import { signinMessages } from "@/i18n/messages/signin";
import { filterPeople, peopleFiltersFromParams, type PeopleFilters } from "./peopleFilters";
import { MODULE_KEYS, ModuleChecks, PersonDetail, PersonPills, REPS_KEY, ROLES, ROLE_KEYS, Setting, send, type Rep } from "./PersonDetail";
import { SellBlockerPills } from "./PersonTagsSales";

// Who may use Xpot, and everything about each person: the one place people
// are created, approved, blocked and deleted (Organizations only adds existing
// people). People sign up with their phone and wait here for approval; an
// admin can also create someone's access directly. The list opens a person at
// /admin/reps/:repId (beside the list on a computer, as a page on a phone), so
// other screens link straight to them. Search and filters live in the URL
// (?q=&status=&role=&module=); ?new=1 opens the create form.

const BASE = "/admin/reps";

function welcomeMessage(t: Translate<typeof manageMessages.en>, name: string, phone: string): string {
  return t("welcomeMessage", { name: name.split(" ")[0], link: window.location.origin, phone: formatPhone(phone) });
}

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
  const people = filterPeople(query.data ?? [], filters);
  const pending = people.filter((r) => r.access === "pending");
  const active = people.filter((r) => r.access === "active");
  const blocked = people.filter((r) => r.access === "blocked" && !r.refused);
  const refused = people.filter((r) => r.access === "blocked" && r.refused);
  // The active list is the long one: it renders a page at a time, keeping the open person on it.
  const activePage = usePagedList(active, { resetKey: filtersKey, keepIndex: selectedId == null ? -1 : active.findIndex((r) => r.id === selectedId) });
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

  const row = (rep: Rep) => <PersonRow key={rep.id} rep={rep} selected={rep.id === selectedId} onOpen={() => open(rep)} />;
  const list = (
    <div className="space-y-6">
      {filtering && people.length === 0 && <EmptyState compact icon={Users} title={t("noPeopleMatch")} />}

      {/* Only when someone is waiting: an empty "waiting" block is noise. */}
      {pending.length > 0 && (
        <section className="space-y-2" data-testid="reps-pending">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            {t("waitingForApproval")}
            <Pill tone="amber" className="min-h-5 px-2 py-0.5">{pending.length}</Pill>
          </h2>
          <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-400/[0.03]`}>{pending.map(row)}</div>
        </section>
      )}

      {(active.length > 0 || !filtering) && (
        <section className="space-y-2" data-testid="reps-active">
          <h2 className="text-sm font-semibold text-white/80">{t("activeCount", { count: active.length })}</h2>
          {active.length === 0 ? (
            <EmptyState compact dense icon={Users} title={t("noActivePeople")} />
          ) : (
            <>
              <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS}`}>{activePage.visible.map(row)}</div>
              <ListPager shown={activePage.shown} total={activePage.total} hasMore={activePage.hasMore} onMore={activePage.showMore} />
            </>
          )}
        </section>
      )}

      {blocked.length > 0 && (
        <section className="space-y-2" data-testid="reps-blocked">
          <h2 className="text-sm font-semibold text-red-300/80">{t("blockedCount", { count: blocked.length })}</h2>
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-red-400/15 bg-red-500/[0.03]">{blocked.map(row)}</div>
        </section>
      )}

      {refused.length > 0 && (
        <section className="space-y-2" data-testid="reps-refused">
          <h2 className="text-sm font-semibold text-white/55">{t("refusedCount", { count: refused.length })}</h2>
          <div className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS} opacity-80`}>{refused.map(row)}</div>
        </section>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <NewResellerForm
        initiallyOpen={urlFilters.values.new === "1"}
        onClosed={() => urlFilters.values.new && urlFilters.set({ new: "" })}
        onCreated={(rep) => navigate(`${BASE}/${rep.id}`)}
      />
      <PeopleToolbar value={filters} onChange={setFilters} active={filtering} shown={people.length} total={query.data.length} />
      {isDesktop ? (
        <MasterDetail
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
  const tse = useT(settingsMessages);
  const set = <K extends keyof PeopleFilters>(key: K, v: PeopleFilters[K]) => onChange({ ...value, [key]: v });
  const fromSelect = <V extends string>(v: string) => (v || "all") as V | "all";
  const toSelect = (v: string) => (v === "all" ? "" : v);
  return (
    <FilterBar
      testId="people-toolbar"
      search={<FilterSearch value={value.search} onChange={(v) => set("search", v)} placeholder={t("searchPeople")} testId="people-search" />}
      controls={
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
            placeholder={`${t("filterRole")}: ${t("filterAll")}`}
            options={ROLES.map((r) => ({ value: r, label: tse(ROLE_KEYS[r]) }))}
          />
          <FilterSelect
            value={toSelect(value.module)}
            onChange={(v) => set("module", fromSelect(v))}
            placeholder={`${t("filterModule")}: ${t("filterAll")}`}
            options={XPOT_MODULES.map((m: XpotModule) => ({ value: m, label: tc(MODULE_KEYS[m]) }))}
          />
        </>
      }
      summary={{ active, shown, total, onClear: () => onChange({ search: "", status: "all", role: "all", module: "all" }) }}
    />
  );
}

/**
 * The admin creates someone's access directly: active, signs in with a code to
 * this phone. The only place a new person is made (Organizations links here).
 */
function NewResellerForm({ initiallyOpen, onClosed, onCreated }: { initiallyOpen: boolean; onClosed: () => void; onCreated: (rep: Rep) => void }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tSignin = useT(signinMessages);
  const queryClient = useQueryClient();
  const [open, setOpenState] = useState(initiallyOpen);
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("1");
  const [phone, setPhone] = useState("");
  // Nothing preselected (the same as approving a sign-up): modules and, for Tags, the cost rule are chosen on purpose.
  const [modules, setModules] = useState<string[]>([]);
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">("");
  const [created, setCreated] = useState<{ message: string; rep: Rep } | null>(null);
  const needsCostPolicy = modules.includes("tags") && !costPolicy;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) onClosed();
  };

  const create = useMutation({
    mutationFn: () =>
      send<Rep>("/api/xpot/admin/reps/accounts", { displayName, phone, countryCode, modules, ...(costPolicy ? { costPolicy } : {}) }),
    onSuccess: (rep) => {
      setCreated({ message: welcomeMessage(t, displayName, rep.phone ?? phone), rep });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      toast({ title: t("repCanSignInNow", { name: displayName }), variant: "success" });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    setDisplayName("");
    setPhone("");
    setModules([]);
    setCostPolicy("");
    setCreated(null);
  };

  if (!open) {
    return (
      <Button variant="brand" onClick={() => setOpen(true)} data-testid="button-new-reseller">
        <UserPlus />
        {t("newReseller")}
      </Button>
    );
  }

  if (created) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4" data-testid="reseller-created">
        <p className="text-sm font-semibold text-emerald-200">{t("accessCreated")}</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-sm text-white">{created.message}</pre>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto">
            <CopyButton value={created.message} label={t("copyMessage")} className="min-h-11" />
          </span>
          <Button variant="ghost" onClick={() => { const rep = created.rep; reset(); setOpen(false); onCreated(rep); }}>
            {tc("close")}
          </Button>
          <Button variant="secondary" onClick={reset}>
            {t("createAnother")}
          </Button>
        </div>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4`} data-testid="new-reseller-form">
      <div>
        <p className="text-sm font-semibold text-white">{t("newReseller")}</p>
        <p className="mt-0.5 text-xs text-white/50">{t("newResellerHint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("fullNamePlaceholder")} aria-label={t("fullNamePlaceholder")} required data-testid="input-reseller-name" />
        <div className="flex min-h-11 gap-2">
          <CountryCodePicker value={countryCode} onChange={setCountryCode} label={tSignin("country")} />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} aria-label={t("phonePlaceholder")} type="tel" required data-testid="input-reseller-phone" />
        </div>
      </div>
      <Setting label={t("modules")}>
        <div className="flex flex-wrap items-center gap-3">
          <ModuleChecks value={modules} onChange={setModules} />
          {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
        </div>
      </Setting>
      {modules.includes("tags") && (
        <Field label={t("costPolicyTitle")} className="sm:max-w-sm">
          <Select value={costPolicy} onChange={(event) => setCostPolicy(event.target.value as "zero" | "acquisition")} data-testid="new-reseller-cost-policy">
            {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
            <option value="zero">{t("costPolicyZero")}</option>
            <option value="acquisition">{t("costPolicyAcquisition")}</option>
          </Select>
        </Field>
      )}
      <FormFooter onCancel={() => setOpen(false)}>
        <Button
          type="submit"
          variant="brand"
          disabled={modules.length === 0 || needsCostPolicy}
          loading={create.isPending}
          data-testid="button-create-reseller"
        >
          {t("createAccess")}
        </Button>
      </FormFooter>
    </form>
  );
}
