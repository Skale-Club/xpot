import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Ban, Check, Copy, KeyRound, Pencil, Phone, RotateCcw, Search, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { settingsMessages } from "@/i18n/messages/settings";
import { signinMessages } from "@/i18n/messages/signin";
import { AdminBadge, useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { Pill, type PillTone } from "@/components/xpot/StatusPill";
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
const MODULE_KEYS = { visits: "moduleVisits", tags: "moduleTags" } as const satisfies Record<XpotModule, keyof typeof commonMessages.en>;
const ROLES = ["rep", "manager", "admin"] as const;
const ROLE_KEYS = { rep: "role_rep", manager: "role_manager", admin: "role_admin" } as const satisfies Record<(typeof ROLES)[number], keyof typeof settingsMessages.en>;
const SELECT = "rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50";
const FIELD =
  "w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50";
const BTN = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40";

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
      toast({ title: successTitle(rep) });
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
    <div className="flex items-center gap-3">
      {XPOT_MODULES.map((module) => (
        <label key={module} className={`flex items-center gap-1.5 text-sm ${disabled ? "text-white/35" : "cursor-pointer text-white/70"}`}>
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

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">{t("repsLoadFailed")}</p>;
  }

  const people = filterPeople(query.data, filters);
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_PEOPLE_FILTERS);
  const pending = people.filter((r) => r.access === "pending");
  const active = people.filter((r) => r.access === "active");
  const blocked = people.filter((r) => r.access === "blocked" && !r.refused);
  const refused = people.filter((r) => r.access === "blocked" && r.refused);

  return (
    <div className="space-y-6">
      <NewResellerForm />
      <PeopleToolbar value={filters} onChange={setFilters} />
      {filtering && people.length === 0 && <p className="text-sm text-white/45">{t("noPeopleMatch")}</p>}

      {/* Only when someone is waiting: an empty "waiting" block is noise. */}
      {pending.length > 0 && (
        <section className="space-y-3" data-testid="reps-pending">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            {t("waitingForApproval")}
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs">{pending.length}</span>
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
            <p className="text-sm text-white/40">{t("noActivePeople")}</p>
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
              {active.map((rep) => (
                <ActiveRow key={rep.id} rep={rep} />
              ))}
            </div>
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

/** Search box and the status, role and module filters. */
function PeopleToolbar({ value, onChange }: { value: PeopleFilters; onChange: (next: PeopleFilters) => void }) {
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const set = <K extends keyof PeopleFilters>(key: K, v: PeopleFilters[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-testid="people-toolbar">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 sm:min-w-[16rem]">
        <Search className="h-4 w-4 shrink-0 text-white/35" />
        <input
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder={t("searchPeople")}
          aria-label={t("searchPeople")}
          className="w-full min-w-0 bg-transparent text-sm text-white placeholder-white/25 outline-none"
          data-testid="people-search"
        />
      </label>
      <select value={value.status} onChange={(e) => set("status", e.target.value as PeopleFilters["status"])} className={SELECT} aria-label={t("filterStatus")} data-testid="people-filter-status">
        <option value="all">{t("filterStatus")}: {t("filterAll")}</option>
        {(["pending", "active", "blocked", "refused"] as const).map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
      </select>
      <select value={value.role} onChange={(e) => set("role", e.target.value as PeopleFilters["role"])} className={SELECT} aria-label={t("filterRole")}>
        <option value="all">{t("filterRole")}: {t("filterAll")}</option>
        {ROLES.map((r) => <option key={r} value={r}>{tse(ROLE_KEYS[r])}</option>)}
      </select>
      <select value={value.module} onChange={(e) => set("module", e.target.value as PeopleFilters["module"])} className={SELECT} aria-label={t("filterModule")}>
        <option value="all">{t("filterModule")}: {t("filterAll")}</option>
        {XPOT_MODULES.map((m) => <option key={m} value={m}>{tc(MODULE_KEYS[m])}</option>)}
      </select>
    </div>
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

const ROLE_TONE: Record<string, PillTone> = { admin: "violet", manager: "blue", rep: "slate" };

/** A labelled block of the editor: the label, the control, and what it means. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      {children}
      {hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

/**
 * A button that opens a small confirmation in place (with an optional text, like a
 * reason or a new phone) instead of the browser's prompt box.
 */
function InlineAction({
  label,
  icon: Icon,
  danger,
  hint,
  placeholder,
  initial = "",
  required,
  confirmLabel,
  busy,
  onConfirm,
  testId,
}: {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  hint?: string;
  /** Shows a text field when set. */
  placeholder?: string;
  initial?: string;
  required?: boolean;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (value: string) => void;
  testId?: string;
}) {
  const tc = useT(commonMessages);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const tone = danger ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-white/10 text-white/70 hover:bg-white/5";
  if (!open) {
    return (
      <button type="button" onClick={() => { setValue(initial); setOpen(true); }} className={`${BTN} border ${tone}`} data-testid={testId}>
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </button>
    );
  }
  return (
    <div className={`w-full space-y-2 rounded-xl border p-3 ${danger ? "border-red-500/25 bg-red-500/[0.05]" : "border-white/10 bg-white/[0.03]"}`}>
      {hint ? <p className="text-xs text-white/60">{hint}</p> : null}
      {placeholder !== undefined ? (
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={FIELD} />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || (required && !value.trim())}
          onClick={() => { onConfirm(value.trim()); setOpen(false); }}
          className={`${BTN} ${danger ? "bg-red-500 text-white hover:bg-red-600" : "bg-blue-500 text-white hover:bg-blue-600"}`}
          data-testid={testId ? `${testId}-confirm` : undefined}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {confirmLabel}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${BTN} text-white/50 hover:text-white/80`}>
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}

function PendingRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  // Nothing preselected: the module choice is made on purpose (the same as creating access).
  const [modules, setModules] = useState<string[]>([]);
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
        {rep.createdAt && <span className="text-xs text-white/35">{t("signedUpOn", { date: new Date(rep.createdAt).toLocaleDateString(t.locale) })}</span>}
        <ModuleChecks value={modules} onChange={setModules} />
        {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
        <button
          type="button"
          disabled={busy || modules.length === 0}
          onClick={() => approve.mutate({ url: `/api/xpot/admin/reps/${rep.id}/approve`, body: { modules }, rep })}
          className={`${BTN} bg-emerald-500 text-white hover:bg-emerald-600`}
          data-testid={`approve-${rep.id}`}
        >
          {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("approve")}
        </button>
        <InlineAction
          label={t("refuse")}
          placeholder={t("reasonOptional")}
          confirmLabel={t("refuse")}
          danger
          busy={busy}
          onConfirm={(reason) => refuse.mutate({ url: `/api/xpot/admin/reps/${rep.id}/refuse`, body: { reason: reason || null }, rep })}
        />
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
        <Pill tone={ROLE_TONE[rep.role] ?? "slate"}>{roleKey ? tse(roleKey) : rep.role}</Pill>
        <span className="text-xs text-white/45">{effective.map((m) => tc(MODULE_KEYS[m as XpotModule])).join(" · ")}</span>
        {rep.team ? <span className="text-xs text-white/45">{rep.team}</span> : null}
        {canEdit && (
          <button type="button" onClick={() => setOpen((v) => !v)} className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`} aria-expanded={open} data-testid={`edit-${rep.id}`}>
            <Pencil className="h-4 w-4" />
            {open ? tc("close") : t("edit")}
          </button>
        )}
      </div>
      {open && canEdit ? <RepEditor rep={rep} onDone={() => setOpen(false)} /> : null}
    </div>
  );
}

function RepEditor({ rep, onDone }: { rep: Rep; onDone: () => void }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const queryClient = useQueryClient();
  const [role, setRole] = useState(rep.role);
  const [team, setTeam] = useState(rep.team ?? "");
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  // Never configured: "Not set" until someone picks a rule on purpose (saving no longer picks one for them).
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">(rep.costPolicyConfiguredAt ? rep.costPolicy ?? "acquisition" : "");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
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
      toast({ title: t("repUpdated", { name: rep.displayName }) });
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
  const FULL_SELECT = `w-full ${SELECT} disabled:opacity-50`;

  return (
    <div className="space-y-5 border-t border-white/[0.06] bg-black/10 px-4 py-4" data-testid={`rep-editor-${rep.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fieldRole")} hint={isSelf ? t("ownRoleLocked") : !isSuperAdmin ? t("roleAdminOnly") : undefined}>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={FULL_SELECT} disabled={roleLocked} data-testid={`role-${rep.id}`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{tse(ROLE_KEYS[r])}</option>
            ))}
          </select>
          {adminChanges && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-2 text-xs text-amber-200" data-testid={`admin-warning-${rep.id}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}
            </p>
          )}
        </Field>
        <Field label={t("fieldTeam")}>
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("teamPlaceholder")} className={FIELD} />
        </Field>
        <Field label={t("costPolicyTitle")} hint={t("costPolicyHint")}>
          <select value={costPolicy} onChange={(e) => setCostPolicy(e.target.value as "zero" | "acquisition")} className={FULL_SELECT} data-testid={`cost-policy-${rep.id}`}>
            {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
            <option value="zero">{t("costPolicyZero")}</option>
            <option value="acquisition">{t("costPolicyAcquisition")}</option>
          </select>
        </Field>
        <Field label={t("modules")} hint={isManager ? t("managersUseAllModules") : undefined}>
          <div className="flex min-h-[38px] items-center">
            <ModuleChecks value={modules} onChange={setModules} disabled={isManager} />
          </div>
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (adminChanges ? setConfirmAdmin(true) : save.mutate())}
          disabled={!dirty || save.isPending || modules.length === 0}
          className={`${BTN} bg-blue-500 text-white hover:bg-blue-600`}
          data-testid={`save-${rep.id}`}
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {tc("save")}
        </button>
        <button type="button" onClick={onDone} className={`${BTN} text-white/50 hover:text-white/80`}>{tc("cancel")}</button>
      </div>

      <div className="grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
        <Field label={t("fieldSignInPhone")} hint={t("signInPhoneHint")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">{rep.loginPhone ? formatPhone(rep.loginPhone) : t("noSignInPhone")}</span>
            <InlineAction
              label={t("changePhone")}
              icon={Phone}
              placeholder={t("phonePlaceholder")}
              initial={rep.loginPhone ?? ""}
              required
              confirmLabel={tc("save")}
              busy={phone.isPending}
              onConfirm={(next) => phone.mutate({ url: `/api/xpot/admin/reps/${rep.id}/phone`, body: { phone: next }, rep })}
            />
          </div>
        </Field>
        {/* The wholesale code buys Tags kits: only for someone who sells Tags (the server refuses the rest). */}
        {sellsTags ? (
          <Field label={t("fieldWholesale")} hint={t("wholesaleHint")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm ${rep.wholesaleCode ? "font-mono text-white/80" : "text-white/40"}`}>{rep.wholesaleCode ?? t("wholesaleNone")}</span>
              {rep.wholesaleCode ? (
                <InlineAction
                  label={t("wholesaleReissue")}
                  icon={KeyRound}
                  hint={t("wholesaleConfirm", { name: rep.displayName, code: rep.wholesaleCode })}
                  confirmLabel={t("wholesaleReissue")}
                  busy={newCode.isPending}
                  onConfirm={() => newCode.mutate({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep })}
                  testId={`wholesale-${rep.id}`}
                />
              ) : (
                <button type="button" disabled={newCode.isPending} onClick={() => newCode.mutate({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep })} className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`} data-testid={`wholesale-${rep.id}`}>
                  <KeyRound className="h-4 w-4" />
                  {t("wholesaleIssue")}
                </button>
              )}
            </div>
          </Field>
        ) : null}
      </div>

      {!isSelf && <div className="border-t border-white/[0.06] pt-4">
        <InlineAction
          label={t("blockTitle")}
          icon={Ban}
          danger
          hint={t("blockHint")}
          placeholder={t("reasonOptional")}
          confirmLabel={t("confirmBlock", { name: rep.displayName })}
          busy={block.isPending}
          onConfirm={(reason) => block.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep })}
          testId={`block-${rep.id}`}
        />
      </div>}

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
        variant: r.files.failed ? "destructive" : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  // The global admin only, like the server (requireSuperAdmin), so it carries the "Admin" tag.
  if (!isSuperAdmin) return null;
  return (
    <>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className={`${BTN} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
        data-testid={`delete-${rep.id}`}
      >
        {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {t("deleteAccount")}
        <AdminBadge />
      </button>
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
        <label className="block space-y-1.5">
          <span className="text-xs text-white/55">{t("deleteAccountTypeHint", { word })}</span>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={word}
            className={FIELD}
            data-testid={`delete-word-${rep.id}`}
          />
        </label>
      </ConfirmDialog>
    </>
  );
}

/** A blocked person, or a refused sign-up (labelled "Refused", with the admin's note). */
function BlockedRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const unblock = useRepAction((r) => t("repCanSignInAgain", { name: r.displayName }));
  const date = rep.blockedAt ? new Date(rep.blockedAt).toLocaleDateString(t.locale) : "";
  const note = blockNote(rep.blockedReason);
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 opacity-80 ${rep.refused ? "border-white/10 bg-white/[0.02]" : "border-red-500/15 bg-red-500/[0.03]"}`}
      data-testid={`rep-${rep.id}`}
    >
      <Identity rep={rep} />
      {rep.refused && <Pill tone="slate">{t("refusedPill")}</Pill>}
      <span className="text-xs text-white/40">
        {(rep.refused ? t("refusedOn", { date }) : t("blockedOn", { date })).trim()}
        {note ? ` · ${note}` : ""}
      </span>
      {(isSuperAdmin || rep.role === "rep") && (
        <button
          type="button"
          disabled={unblock.isPending}
          onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
          className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`}
        >
          <RotateCcw className="h-4 w-4" />
          {t("unblock")}
        </button>
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
      toast({ title: t("repCanSignInNow", { name: displayName }) });
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
      <button type="button" onClick={() => setOpen(true)} className={`${BTN} bg-blue-500 py-2 text-white hover:bg-blue-600`} data-testid="button-new-reseller">
        <UserPlus className="h-4 w-4" />
        {t("newReseller")}
      </button>
    );
  }

  if (created) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4" data-testid="reseller-created">
        <p className="text-sm font-semibold text-emerald-200">{t("accessCreated")}</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-sm text-white">{created}</pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(created).then(() => toast({ title: tc("copied") }))}
            className={`${BTN} bg-emerald-500 py-2 text-white hover:bg-emerald-600`}
          >
            <Copy className="h-4 w-4" />
            {t("copyMessage")}
          </button>
          <button type="button" onClick={reset} className={`${BTN} border border-white/10 py-2 text-white/70 hover:bg-white/5`}>
            {t("createAnother")}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className={`${BTN} py-2 text-white/50 hover:text-white/80`}
          >
            {tc("close")}
          </button>
        </div>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-blue-500/25 bg-blue-500/[0.04] p-4" data-testid="new-reseller-form">
      <p className="text-sm font-semibold text-white">{t("newReseller")}</p>
      <p className="text-xs text-white/50">{t("newResellerHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("fullNamePlaceholder")} required className={FIELD} data-testid="input-reseller-name" />
        <div className="flex gap-2">
          <CountryCodePicker value={countryCode} onChange={setCountryCode} label={tSignin("country")} className="rounded-lg text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} type="tel" required className={FIELD} data-testid="input-reseller-phone" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs uppercase tracking-wider text-white/40">{t("modules")}</span>
        <ModuleChecks value={modules} onChange={setModules} />
        {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
      </div>
      {modules.includes("tags") && (
        <label className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-white/40">{t("costPolicyTitle")}</span>
          <select value={costPolicy} onChange={(event) => setCostPolicy(event.target.value as "zero" | "acquisition")} className={SELECT} data-testid="new-reseller-cost-policy">
            {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
            <option value="zero">{t("costPolicyZero")}</option>
            <option value="acquisition">{t("costPolicyAcquisition")}</option>
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || modules.length === 0 || needsCostPolicy}
          className={`${BTN} bg-blue-500 py-2 text-white hover:bg-blue-600`}
          data-testid="button-create-reseller"
        >
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("createAccess")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${BTN} py-2 text-white/50 hover:text-white/80`}>
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
