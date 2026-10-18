import { useState, type FormEvent, type ReactNode } from "react";
import { Ban, Check, KeyRound, Pencil, Phone, RotateCcw, Trash2, UserPlus, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/xpot/CopyButton";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/xpot/filters";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { formatDate } from "@/lib/format";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { adminUiMessages } from "@/i18n/messages/adminUi";
import { manageMessages } from "@/i18n/messages/manage";
import { settingsMessages } from "@/i18n/messages/settings";
import { signinMessages } from "@/i18n/messages/signin";
import { AdminBadge, useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { Pill, ROLE_TONE, toneOf } from "@/components/xpot/StatusPill";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { blockNote } from "@shared/repAccess";
import { filterPeople, NO_PEOPLE_FILTERS, type PeopleFilters } from "./peopleFilters";

// Who may use Xpot. People sign up with their phone and wait here for
// approval; an admin can also create someone's access directly. Everyone
// signs in with a code texted to their phone. Blocking ends the partnership
// and logs the rep out everywhere; refusing a sign-up blocks it too but is
// listed apart, as "Refused". A blocked rep's account can then be deleted
// on their request (admins only; server/accountDeletion.ts). Managers act on
// reps only: the controls the server would refuse them (403) are not shown.

type Access = "pending" | "active" | "blocked";

type Rep = {
  id: number;
  userId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  loginPhone: string | null;
  wholesaleCode: string | null;
  costPolicy: "zero" | "acquisition";
  costPolicyConfiguredAt: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[];
  access: Access;
  /** Blocked because their sign-up was refused (shared/repAccess.ts). */
  refused: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string | null;
  application: {
    email: string | null;
    workCity: string | null;
    workRegion: string | null;
    occupation: string | null;
    availability: "weekdays" | "evenings" | "weekends" | "flexible" | null;
    hasVehicle: boolean | null;
    languages: string[] | null;
    otherLanguages: string | null;
    salesExperience: "none" | "some" | "experienced" | null;
    fieldSalesReadiness: "ready" | "with_support" | "not_ready" | null;
    kitInvestmentAcknowledged: boolean | null;
    activeSellerAcknowledged: boolean | null;
    message: string | null;
    status: string;
    submittedAt: string;
  } | null;
};

const REPS_KEY = ["/api/xpot/admin/reps"];
/** The outline button for a destructive step (block, refuse, delete); the dialog it opens is the red one. */
const DANGER_OUTLINE = "border-red-400/30 text-red-300 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200";
const MODULE_KEYS = { visits: "moduleVisits", tags: "moduleTags" } as const satisfies Record<XpotModule, keyof typeof commonMessages.en>;
const ROLES = ["rep", "manager", "admin"] as const;
const ROLE_KEYS = { rep: "role_rep", manager: "role_manager", admin: "role_admin" } as const satisfies Record<(typeof ROLES)[number], keyof typeof settingsMessages.en>;

async function send<T>(url: string, body: unknown = {}, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || translate(commonMessages, "requestFailed"));
  return data as T;
}

function useRepAction(successTitle: (rep: Rep) => string) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown; rep: Rep }) => send(url, body),
    onSuccess: (_data, { rep }) => {
      toast({ title: successTitle(rep), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
}

function welcomeMessage(t: Translate<typeof manageMessages.en>, name: string, phone: string): string {
  return t("welcomeMessage", { name: name.split(" ")[0], link: window.location.origin, phone: formatPhone(phone) });
}

function ModuleChecks({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const tc = useT(commonMessages);
  return (
    <div className="flex items-center gap-1">
      {XPOT_MODULES.map((module) => (
        <label key={module} className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm ${disabled ? "text-white/35" : "cursor-pointer text-white/70 hover:bg-white/[0.04]"}`}>
          <input
            type="checkbox"
            checked={disabled || value.includes(module)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? (value.includes(module) ? value : [...value, module]) : value.filter((m) => m !== module))}
            className="h-4 w-4 accent-blue-500"
          />
          {tc(MODULE_KEYS[module])}
        </label>
      ))}
    </div>
  );
}

export function AdminReps() {
  const query = useQuery<Rep[]>({ queryKey: REPS_KEY });
  const t = useT(manageMessages);
  const [filters, setFilters] = useState<PeopleFilters>(NO_PEOPLE_FILTERS);
  const people = filterPeople(query.data ?? [], filters);
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_PEOPLE_FILTERS);
  const pending = people.filter((r) => r.access === "pending");
  const active = people.filter((r) => r.access === "active");
  const blocked = people.filter((r) => r.access === "blocked" && !r.refused);
  const refused = people.filter((r) => r.access === "blocked" && r.refused);
  // The active list is the long one: it renders a page at a time.
  const activePage = usePagedList(active, { resetKey: JSON.stringify(filters) });

  if (query.isLoading) return <ListSkeleton rows={5} />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("repsLoadFailed")} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <NewResellerForm />
      <PeopleToolbar value={filters} onChange={setFilters} shown={people.length} total={query.data.length} />
      {filtering && people.length === 0 && <EmptyState compact icon={Users} title={t("noPeopleMatch")} />}

      {/* Only when someone is waiting: an empty "waiting" block is noise. */}
      {pending.length > 0 && (
        <section className="space-y-3" data-testid="reps-pending">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            {t("waitingForApproval")}
            <Pill tone="amber" className="min-h-5 px-2 py-0.5">{pending.length}</Pill>
          </h2>
          {pending.map((rep) => (
            <PendingRow key={rep.id} rep={rep} />
          ))}
        </section>
      )}

      {(active.length > 0 || !filtering) && (
        <section className="space-y-3" data-testid="reps-active">
          <h2 className="text-sm font-semibold text-white/80">{t("activeCount", { count: active.length })}</h2>
          {active.length === 0 ? (
            <EmptyState compact dense icon={Users} title={t("noActivePeople")} />
          ) : (
            <>
              <div className={`divide-y divide-white/[0.06] rounded-2xl ${GLASS_CLASS}`}>
                {activePage.visible.map((rep) => (
                  <ActiveRow key={rep.id} rep={rep} />
                ))}
              </div>
              <ListPager shown={activePage.shown} total={activePage.total} hasMore={activePage.hasMore} onMore={activePage.showMore} />
            </>
          )}
        </section>
      )}

      {blocked.length > 0 && (
        <section className="space-y-3" data-testid="reps-blocked">
          <h2 className="text-sm font-semibold text-red-300/80">{t("blockedCount", { count: blocked.length })}</h2>
          {blocked.map((rep) => (
            <BlockedRow key={rep.id} rep={rep} />
          ))}
        </section>
      )}

      {refused.length > 0 && (
        <section className="space-y-3" data-testid="reps-refused">
          <h2 className="text-sm font-semibold text-white/55">{t("refusedCount", { count: refused.length })}</h2>
          {refused.map((rep) => (
            <BlockedRow key={rep.id} rep={rep} />
          ))}
        </section>
      )}
    </div>
  );
}

/** Search box and the status, role and module filters ("" in a select is "all"). */
function PeopleToolbar({ value, onChange, shown, total }: { value: PeopleFilters; onChange: (next: PeopleFilters) => void; shown: number; total: number }) {
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
            options={XPOT_MODULES.map((m) => ({ value: m, label: tc(MODULE_KEYS[m]) }))}
          />
        </>
      }
      summary={{ active: JSON.stringify(value) !== JSON.stringify(NO_PEOPLE_FILTERS), shown, total, onClear: () => onChange(NO_PEOPLE_FILTERS) }}
    />
  );
}

function Identity({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-white">{rep.displayName}</p>
      <p className="truncate text-xs text-white/40">
        {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">{t("noSignInPhone")}</span>}
        {rep.email ? ` · ${rep.email}` : ""}
      </p>
    </div>
  );
}

function PendingRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  // Nothing preselected: the module choice is made on purpose (the same as creating access).
  const [modules, setModules] = useState<string[]>([]);
  const [refusing, setRefusing] = useState(false);
  const approve = useRepAction((r) => t("repCanSignInNow", { name: r.displayName }));
  const refuse = useRepAction((r) => t("repRefused", { name: r.displayName }));
  const busy = approve.isPending || refuse.isPending;
  const availabilityKey = rep.application?.availability ? `applicationAvailability_${rep.application.availability}` as const : null;
  const experienceKey = rep.application?.salesExperience ? `applicationSales_${rep.application.salesExperience}` as const : null;
  const readinessKey = rep.application?.fieldSalesReadiness ? `applicationReadiness_${rep.application.fieldSalesReadiness}` as const : null;
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4" data-testid={`rep-${rep.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Identity rep={rep} />
        {rep.createdAt && <span className="text-xs text-white/35">{t("signedUpOn", { date: formatDate(rep.createdAt) })}</span>}
        <ModuleChecks value={modules} onChange={setModules} />
        {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
        <Button
          variant="brand"
          size="sm"
          disabled={busy || modules.length === 0}
          loading={approve.isPending}
          onClick={() => approve.mutate({ url: `/api/xpot/admin/reps/${rep.id}/approve`, body: { modules }, rep })}
          data-testid={`approve-${rep.id}`}
        >
          <Check />
          {t("approve")}
        </Button>
        <Button variant="outline" size="sm" className={DANGER_OUTLINE} disabled={busy} onClick={() => setRefusing(true)}>
          {t("refuse")}
        </Button>
      </div>
      {rep.application ? (
        <div className="mt-4 border-t border-white/[0.07] pt-4" data-testid={`application-${rep.id}`}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-white/35">{t("applicationEmail")}</dt><dd className="mt-0.5 break-words text-white/75">{rep.application.email || "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationCity")}</dt><dd className="mt-0.5 text-white/75">{[rep.application.workCity, rep.application.workRegion].filter(Boolean).join(", ") || "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationOccupation")}</dt><dd className="mt-0.5 text-white/75">{rep.application.occupation || "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationAvailability")}</dt><dd className="mt-0.5 text-white/75">{availabilityKey ? t(availabilityKey) : "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationVehicle")}</dt><dd className="mt-0.5 text-white/75">{rep.application.hasVehicle === null ? "—" : rep.application.hasVehicle ? t("applicationYes") : t("applicationNo")}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationLanguages")}</dt><dd className="mt-0.5 text-white/75">{[...(rep.application.languages ?? []), rep.application.otherLanguages].filter(Boolean).join(", ") || "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationSalesExperience")}</dt><dd className="mt-0.5 text-white/75">{experienceKey ? t(experienceKey) : "—"}</dd></div>
            <div><dt className="text-xs text-white/35">{t("applicationFieldReadiness")}</dt><dd className="mt-0.5 text-white/75">{readinessKey ? t(readinessKey) : "—"}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-white/45">
            {rep.application.kitInvestmentAcknowledged && rep.application.activeSellerAcknowledged ? `✓ ${t("applicationTermsAcknowledged")}` : t("applicationTermsMissing")}
          </p>
          {rep.application.message ? <p className="mt-3 text-sm leading-relaxed text-white/55"><span className="font-medium text-white/70">{t("applicationMessage")}:</span> {rep.application.message}</p> : null}
        </div>
      ) : (
        <p className="mt-4 border-t border-white/[0.07] pt-3 text-xs text-amber-200/70">{t("applicationMissing")}</p>
      )}
      <ConfirmDialog
        open={refusing}
        onOpenChange={setRefusing}
        tone="danger"
        title={tu("refuseTitle", { name: rep.displayName })}
        description={tu("refuseBody")}
        reason="optional"
        reasonLabel={t("reasonOptional")}
        confirmLabel={t("refuse")}
        onConfirm={(reason) => refuse.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/refuse`, body: { reason: reason || null }, rep })}
      />
    </div>
  );
}

/** One person: a summary line; "Edit" opens their settings, each labelled. */
function ActiveRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const [open, setOpen] = useState(false);
  const isSuperAdmin = useIsSuperAdmin();
  const effective = repModules({ role: rep.role, modules: rep.modules });
  const roleKey = ROLE_KEYS[rep.role as (typeof ROLES)[number]];
  // A manager may only act on reps (the server answers 403 for managers and admins).
  const canEdit = isSuperAdmin || rep.role === "rep";
  return (
    <div data-testid={`rep-${rep.id}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Identity rep={rep} />
        <Pill tone={toneOf(ROLE_TONE, rep.role)}>{roleKey ? tse(roleKey) : rep.role}</Pill>
        <span className="text-xs text-white/45">{effective.map((m) => tc(MODULE_KEYS[m as XpotModule])).join(" · ")}</span>
        {rep.team ? <span className="text-xs text-white/45">{rep.team}</span> : null}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={`edit-${rep.id}`}>
            <Pencil />
            {open ? tc("close") : t("edit")}
          </Button>
        )}
      </div>
      {open && canEdit ? <RepEditor rep={rep} onDone={() => setOpen(false)} /> : null}
    </div>
  );
}

/** A label over a value and its actions, for the rows of the editor that are not a single control. */
function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold text-white/60">{label}</p>
      {children}
      {hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

function RepEditor({ rep, onDone }: { rep: Rep; onDone: () => void }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const queryClient = useQueryClient();
  const [role, setRole] = useState(rep.role);
  const [team, setTeam] = useState(rep.team ?? "");
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  // Never configured: "Not set" until someone picks a rule on purpose (saving no longer picks one for them).
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">(rep.costPolicyConfiguredAt ? rep.costPolicy ?? "acquisition" : "");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [dialog, setDialog] = useState<"block" | "phone" | "wholesale" | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const isSuperAdmin = useIsSuperAdmin();
  const isManager = role === "manager" || role === "admin";
  const sameModules = [...modules].sort().join() === [...(rep.modules ?? XPOT_MODULES)].sort().join();
  const costChanged = costPolicy !== "" && (costPolicy !== rep.costPolicy || !rep.costPolicyConfiguredAt);
  const dirty = role !== rep.role || (team || "") !== (rep.team || "") || !sameModules || costChanged;
  // The "admin" role is the global Xpot admin (storage.updateSalesRepAccountProfile): changing it signs them out.
  const adminChanges = (role === "admin") !== (rep.role === "admin");

  const save = useMutation({
    mutationFn: () =>
      send("/api/xpot/admin/reps", {
        userId: rep.userId,
        displayName: rep.displayName,
        email: rep.email,
        role,
        team: team || null,
        modules,
        ...(costPolicy ? { costPolicy } : {}),
      }),
    onSuccess: () => {
      setConfirmAdmin(false);
      toast({ title: t("repUpdated", { name: rep.displayName }), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      onDone();
    },
    onError: (e: Error) => {
      setConfirmAdmin(false);
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    },
  });
  const block = useRepAction((r) => t("repBlocked", { name: r.displayName }));
  const phone = useRepAction((r) => t("repPhoneChanged", { name: r.displayName }));
  const newCode = useRepAction((r) => t("repNewCode", { name: r.displayName }));
  const sellsTags = repModules({ role: rep.role, modules: rep.modules }).includes("tags");
  // Blocking yourself would lock you out of the admin you are using.
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  // Your own role is locked (you'd sign yourself out), and only the global admin changes roles at all.
  const roleLocked = isSelf || !isSuperAdmin;
  const issueCode = () => newCode.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep });

  return (
    <div className="space-y-5 border-t border-white/[0.06] bg-black/10 px-4 py-4" data-testid={`rep-editor-${rep.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Field label={t("fieldRole")} hint={isSelf ? t("ownRoleLocked") : !isSuperAdmin ? t("roleAdminOnly") : undefined}>
            <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={roleLocked} data-testid={`role-${rep.id}`}
              options={ROLES.map((r) => ({ value: r, label: tse(ROLE_KEYS[r]) }))} />
          </Field>
          {adminChanges && (
            <div data-testid={`admin-warning-${rep.id}`}>
              <InlineAlert tone="warning">
                {role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}
              </InlineAlert>
            </div>
          )}
        </div>
        <Field label={t("fieldTeam")}>
          <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("teamPlaceholder")} />
        </Field>
        <Field label={t("costPolicyTitle")} hint={t("costPolicyHint")}>
          <Select value={costPolicy} onChange={(e) => setCostPolicy(e.target.value as "zero" | "acquisition")} data-testid={`cost-policy-${rep.id}`}>
            {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
            <option value="zero">{t("costPolicyZero")}</option>
            <option value="acquisition">{t("costPolicyAcquisition")}</option>
          </Select>
        </Field>
        <Setting label={t("modules")} hint={isManager ? t("managersUseAllModules") : undefined}>
          <ModuleChecks value={modules} onChange={setModules} disabled={isManager} />
        </Setting>
      </div>
      <FormFooter dirty={dirty} onCancel={onDone}>
        <Button
          variant="brand"
          onClick={() => (adminChanges ? setConfirmAdmin(true) : save.mutate())}
          disabled={!dirty || modules.length === 0}
          loading={save.isPending}
          data-testid={`save-${rep.id}`}
        >
          {tc("save")}
        </Button>
      </FormFooter>

      <div className="grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
        <Setting label={t("fieldSignInPhone")} hint={t("signInPhoneHint")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">{rep.loginPhone ? formatPhone(rep.loginPhone) : t("noSignInPhone")}</span>
            <Button variant="secondary" size="sm" onClick={() => { setNewPhone(rep.loginPhone ?? ""); setDialog("phone"); }}>
              <Phone />
              {t("changePhone")}
            </Button>
          </div>
        </Setting>
        {/* The wholesale code buys Tags kits: only for someone who sells Tags (the server refuses the rest). */}
        {sellsTags ? (
          <Setting label={t("fieldWholesale")} hint={t("wholesaleHint")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm ${rep.wholesaleCode ? "font-mono text-white/80" : "text-white/40"}`}>{rep.wholesaleCode ?? t("wholesaleNone")}</span>
              <Button
                variant="secondary"
                size="sm"
                loading={!rep.wholesaleCode && newCode.isPending}
                // Replacing a code cancels the old one, so that asks first; the first one doesn't.
                onClick={() => (rep.wholesaleCode ? setDialog("wholesale") : void issueCode().catch(() => undefined))}
                data-testid={`wholesale-${rep.id}`}
              >
                <KeyRound />
                {rep.wholesaleCode ? t("wholesaleReissue") : t("wholesaleIssue")}
              </Button>
            </div>
          </Setting>
        ) : null}
      </div>

      {!isSelf && (
        <div className="border-t border-white/[0.06] pt-4">
          <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setDialog("block")} data-testid={`block-${rep.id}`}>
            <Ban />
            {t("blockTitle")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmAdmin}
        onOpenChange={setConfirmAdmin}
        title={role === "admin" ? t("confirmAdminTitle", { name: rep.displayName }) : t("confirmAdminRemoveTitle", { name: rep.displayName })}
        description={role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}
        confirmLabel={t("confirmAdminAction")}
        destructive={role !== "admin"}
        busy={save.isPending}
        onConfirm={() => save.mutate()}
        testId={`confirm-admin-${rep.id}`}
      />
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={(o) => !o && setDialog(null)}
        tone="danger"
        title={t("confirmBlock", { name: rep.displayName })}
        description={t("blockHint")}
        reason="optional"
        reasonLabel={t("reasonOptional")}
        confirmLabel={t("block")}
        onConfirm={(reason) => block.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep })}
        testId={`block-${rep.id}-confirm`}
      />
      <ConfirmDialog
        open={dialog === "phone"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={tu("changePhoneTitle", { name: rep.displayName })}
        description={t("signInPhoneHint")}
        confirmLabel={tc("save")}
        confirmDisabled={!newPhone.trim() || newPhone.trim() === (rep.loginPhone ?? "")}
        onConfirm={() => phone.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/phone`, body: { phone: newPhone.trim() }, rep })}
      >
        <Field label={t("fieldSignInPhone")}>
          <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("phonePlaceholder")} type="tel" autoFocus />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "wholesale"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("wholesaleReissue")}
        description={t("wholesaleConfirm", { name: rep.displayName, code: rep.wholesaleCode ?? "" })}
        confirmLabel={t("wholesaleReissue")}
        onConfirm={issueCode}
        testId={`wholesale-${rep.id}-confirm`}
      />
    </div>
  );
}

type DeletionResult = { account: "deleted" | "anonymized"; leadsDeleted: number; leadsUnassigned: number; visitsDeleted: number; files: { deleted: number; failed: number } };

/** Delete the account and its data, when the person asks (privacy policy, "How long we keep it"). */
function DeleteAccountButton({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const word = t("deleteAccountWord");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    // The API's own guard word is always "DELETE"; the one typed is localized.
    mutationFn: () => send<DeletionResult>(`/api/xpot/admin/reps/${rep.id}`, { confirm: "DELETE" }, "DELETE"),
    onSuccess: (r) => {
      setOpen(false);
      toast({
        title: t("accountDeleted", { name: rep.displayName }),
        description: [
          t("accountDeletedSummary", { leads: r.leadsDeleted, visits: r.visitsDeleted, files: r.files.deleted }),
          r.leadsUnassigned ? t("accountDeletedKept", { count: r.leadsUnassigned }) : "",
          r.files.failed ? t("accountDeletedFilesFailed", { count: r.files.failed }) : "",
        ].filter(Boolean).join(" "),
        variant: r.files.failed ? "destructive" : "success",
      });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  // The global admin only, like the server (requireSuperAdmin), so it carries the "Admin" tag.
  if (!isSuperAdmin) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={DANGER_OUTLINE}
        loading={remove.isPending}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        data-testid={`delete-${rep.id}`}
      >
        <Trash2 />
        {t("deleteAccount")}
        <AdminBadge />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteAccountTitle", { name: rep.displayName })}
        description={t("deleteAccountBody")}
        confirmLabel={t("deleteAccount")}
        destructive
        busy={remove.isPending}
        // The word is typed in the admin's language and in capitals, like the hint says.
        confirmDisabled={typed.trim() !== word}
        onConfirm={() => remove.mutate()}
        testId={`delete-dialog-${rep.id}`}
      >
        <Field label={t("deleteAccountTypeHint", { word })}>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={word}
            autoComplete="off"
            data-testid={`delete-word-${rep.id}`}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}

/** A blocked person, or a refused sign-up (labelled "Refused", with the admin's note). */
function BlockedRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const unblock = useRepAction((r) => t("repCanSignInAgain", { name: r.displayName }));
  const date = rep.blockedAt ? formatDate(rep.blockedAt) : "";
  const note = blockNote(rep.blockedReason);
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 opacity-80 ${rep.refused ? GLASS_SUBTLE_CLASS : "border border-red-400/15 bg-red-500/[0.03]"}`}
      data-testid={`rep-${rep.id}`}
    >
      <Identity rep={rep} />
      {rep.refused && <Pill tone="slate">{t("refusedPill")}</Pill>}
      <span className="text-xs text-white/40">
        {(rep.refused ? t("refusedOn", { date }) : t("blockedOn", { date })).trim()}
        {note ? ` · ${note}` : ""}
      </span>
      {(isSuperAdmin || rep.role === "rep") && (
        <Button
          variant="secondary"
          size="sm"
          loading={unblock.isPending}
          onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
        >
          <RotateCcw />
          {t("unblock")}
        </Button>
      )}
      <DeleteAccountButton rep={rep} />
    </div>
  );
}

/** The admin creates someone's access directly: active, signs in with a code to this phone. */
function NewResellerForm() {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tSignin = useT(signinMessages);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("1");
  const [phone, setPhone] = useState("");
  // Nothing preselected (the same as approving a sign-up): modules and, for Tags, the cost rule are chosen on purpose.
  const [modules, setModules] = useState<string[]>([]);
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">("");
  const [created, setCreated] = useState<string | null>(null);
  const needsCostPolicy = modules.includes("tags") && !costPolicy;

  const create = useMutation({
    mutationFn: () =>
      send<Rep>("/api/xpot/admin/reps/accounts", { displayName, phone, countryCode, modules, ...(costPolicy ? { costPolicy } : {}) }),
    onSuccess: (rep) => {
      setCreated(welcomeMessage(t, displayName, rep.phone ?? phone));
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
        <pre className="whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-sm text-white">{created}</pre>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto">
            <CopyButton value={created} label={t("copyMessage")} className="min-h-11" />
          </span>
          <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>
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
