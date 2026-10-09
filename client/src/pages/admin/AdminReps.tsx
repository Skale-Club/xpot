import { useState, type FormEvent, type ReactNode } from "react";
import { Ban, Check, Copy, KeyRound, Pencil, Phone, RotateCcw, Trash2, UserPlus, type LucideIcon } from "lucide-react";
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
import type { XpotMeResponse } from "@/pages/xpot/types";

// Who may use Xpot. People sign up with their phone and wait here for
// approval; an admin can also create someone's access directly. Everyone
// signs in with a code texted to their phone. Blocking ends the partnership
// and logs the rep out everywhere. A blocked rep's account can then be deleted
// on their request (admins only; server/accountDeletion.ts).

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
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string | null;
};

const REPS_KEY = ["/api/xpot/admin/reps"];
const MODULE_KEYS = { visits: "moduleVisits", tags: "moduleTags" } as const satisfies Record<XpotModule, keyof typeof commonMessages.en>;
const ROLES = ["rep", "manager", "admin"] as const;
const ROLE_KEYS = { rep: "role_rep", manager: "role_manager", admin: "role_admin" } as const satisfies Record<(typeof ROLES)[number], keyof typeof settingsMessages.en>;
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

  const pending = query.data.filter((r) => r.access === "pending");
  const active = query.data.filter((r) => r.access === "active");
  const blocked = query.data.filter((r) => r.access === "blocked");

  return (
    <div className="space-y-6">
      <NewResellerForm />

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

      <section className="space-y-3" data-testid="reps-active">
        <h2 className="text-sm font-semibold text-white/80">{t("activeCount", { count: active.length })}</h2>
        <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
          {active.map((rep) => (
            <ActiveRow key={rep.id} rep={rep} />
          ))}
        </div>
      </section>

      {blocked.length > 0 && (
        <section className="space-y-3" data-testid="reps-blocked">
          <h2 className="text-sm font-semibold text-red-300/80">{t("blockedCount", { count: blocked.length })}</h2>
          {blocked.map((rep) => (
            <BlockedRow key={rep.id} rep={rep} />
          ))}
        </section>
      )}
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
  const [modules, setModules] = useState<string[]>(rep.modules?.length ? rep.modules : [...XPOT_MODULES]);
  const approve = useRepAction((r) => t("repCanSignInNow", { name: r.displayName }));
  const refuse = useRepAction((r) => t("repRefused", { name: r.displayName }));
  const busy = approve.isPending || refuse.isPending;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      {rep.createdAt && <span className="text-xs text-white/35">{t("signedUpOn", { date: new Date(rep.createdAt).toLocaleDateString(t.locale) })}</span>}
      <ModuleChecks value={modules} onChange={setModules} />
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
        onConfirm={(reason) => refuse.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || t("signUpRefusedReason") }, rep })}
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
  const effective = repModules({ role: rep.role, modules: rep.modules });
  const roleKey = ROLE_KEYS[rep.role as (typeof ROLES)[number]];
  return (
    <div data-testid={`rep-${rep.id}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Identity rep={rep} />
        <Pill tone={ROLE_TONE[rep.role] ?? "slate"}>{roleKey ? tse(roleKey) : rep.role}</Pill>
        <span className="text-xs text-white/45">{effective.map((m) => tc(MODULE_KEYS[m as XpotModule])).join(" · ")}</span>
        {rep.team ? <span className="text-xs text-white/45">{rep.team}</span> : null}
        <button type="button" onClick={() => setOpen((v) => !v)} className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`} aria-expanded={open} data-testid={`edit-${rep.id}`}>
          <Pencil className="h-4 w-4" />
          {open ? tc("close") : t("edit")}
        </button>
      </div>
      {open ? <RepEditor rep={rep} onDone={() => setOpen(false)} /> : null}
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
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition">(rep.costPolicy ?? "acquisition");
  const isManager = role === "manager" || role === "admin";
  const sameModules = [...modules].sort().join() === [...(rep.modules ?? XPOT_MODULES)].sort().join();
  const dirty = role !== rep.role || (team || "") !== (rep.team || "") || !sameModules || costPolicy !== rep.costPolicy || !rep.costPolicyConfiguredAt;

  const save = useMutation({
    mutationFn: () =>
      send("/api/xpot/admin/reps", { userId: rep.userId, displayName: rep.displayName, email: rep.email, role, team: team || null, modules, costPolicy }),
    onSuccess: () => {
      toast({ title: t("repUpdated", { name: rep.displayName }) });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      onDone();
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  const block = useRepAction((r) => t("repBlocked", { name: r.displayName }));
  const phone = useRepAction((r) => t("repPhoneChanged", { name: r.displayName }));
  const newCode = useRepAction((r) => t("repNewCode", { name: r.displayName }));
  const sellsTags = repModules({ role: rep.role, modules: rep.modules }).includes("tags");
  // Blocking yourself would lock you out of the admin you are using.
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  const SELECT = "w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50";

  return (
    <div className="space-y-5 border-t border-white/[0.06] bg-black/10 px-4 py-4" data-testid={`rep-editor-${rep.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fieldRole")}>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={SELECT}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{tse(ROLE_KEYS[r])}</option>
            ))}
          </select>
        </Field>
        <Field label={t("fieldTeam")}>
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("teamPlaceholder")} className={FIELD} />
        </Field>
        <Field label={t("costPolicyTitle")} hint={t("costPolicyHint")}>
          <select value={costPolicy} onChange={(e) => setCostPolicy(e.target.value as "zero" | "acquisition")} className={SELECT} data-testid={`cost-policy-${rep.id}`}>
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
        <button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending || modules.length === 0} className={`${BTN} bg-blue-500 text-white hover:bg-blue-600`}>
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
  const remove = useMutation({
    // The API's own guard word is always "DELETE"; the one typed is localized.
    mutationFn: () => send<DeletionResult>(`/api/xpot/admin/reps/${rep.id}`, { confirm: "DELETE" }, "DELETE"),
    onSuccess: (r) => {
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
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => {
        const typed = window.prompt(t("deleteAccountPrompt", { name: rep.displayName, word }), "");
        if (typed === word) remove.mutate();
        else if (typed !== null) toast({ title: t("notDeleted"), description: t("notDeletedHint", { word }) });
      }}
      className={`${BTN} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
      data-testid={`delete-${rep.id}`}
    >
      {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {t("deleteAccount")}
      <AdminBadge />
    </button>
  );
}

function BlockedRow({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const unblock = useRepAction((r) => t("repCanSignInAgain", { name: r.displayName }));
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-4 opacity-80" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      <span className="text-xs text-white/40">
        {t("blockedOn", { date: rep.blockedAt ? new Date(rep.blockedAt).toLocaleDateString(t.locale) : "" }).trim()}
        {rep.blockedReason ? ` · ${rep.blockedReason}` : ""}
      </span>
      <button
        type="button"
        disabled={unblock.isPending}
        onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
        className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`}
      >
        <RotateCcw className="h-4 w-4" />
        {t("unblock")}
      </button>
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
  const [modules, setModules] = useState<string[]>(["tags"]);
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition">("acquisition");
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => send<Rep>("/api/xpot/admin/reps/accounts", { displayName, phone, countryCode, modules, costPolicy }),
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
    setModules(["tags"]);
    setCostPolicy("acquisition");
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
        <select value={costPolicy} onChange={(event) => setCostPolicy(event.target.value as "zero" | "acquisition")}
          className="rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50">
          <option value="zero">{t("costPolicyZero")}</option>
          <option value="acquisition">{t("costPolicyAcquisition")}</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || modules.length === 0}
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
