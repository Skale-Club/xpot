import { useState, type FormEvent } from "react";
import { Ban, Check, Copy, KeyRound, Phone, RotateCcw, UserPlus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { XPOT_MODULES, type XpotModule } from "@shared/modules";
import { PHONE_COUNTRIES, formatPhone } from "@shared/phone";
import { translate, useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { settingsMessages } from "@/i18n/messages/settings";

// Who may use Xpot. People sign up with their phone and wait here for
// approval; an admin can also create someone's access directly. Everyone
// signs in with a code texted to their phone. Blocking ends the partnership
// and logs the rep out everywhere.

type Access = "pending" | "active" | "blocked";

type Rep = {
  id: number;
  userId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  loginPhone: string | null;
  wholesaleCode: string | null;
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

async function send<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
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

      <section className="space-y-3" data-testid="reps-pending">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300/80">
          {t("waitingForApproval")} {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-white/40">{t("nobodyWaiting")}</p>
        ) : (
          pending.map((rep) => <PendingRow key={rep.id} rep={rep} />)
        )}
      </section>

      <section className="space-y-3" data-testid="reps-active">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{t("activeCount", { count: active.length })}</h2>
        <p className="text-xs text-white/40">{t("managersGetAllModules")}</p>
        {active.map((rep) => (
          <ActiveRow key={rep.id} rep={rep} />
        ))}
      </section>

      {blocked.length > 0 && (
        <section className="space-y-3" data-testid="reps-blocked">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-red-300/70">{t("blockedCount", { count: blocked.length })}</h2>
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
      <p className="truncate font-medium">{rep.displayName}</p>
      <p className="truncate text-xs text-white/40">
        {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">{t("noSignInPhone")}</span>}
        {rep.email ? ` · ${rep.email}` : ""}
      </p>
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
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const reason = window.prompt(t("refusePrompt", { name: rep.displayName }), "");
          if (reason !== null) refuse.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || t("signUpRefusedReason") }, rep });
        }}
        className={`${BTN} border border-white/10 text-white/60 hover:bg-white/5`}
      >
        {t("refuse")}
      </button>
    </div>
  );
}

function ActiveRow({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const queryClient = useQueryClient();
  const [role, setRole] = useState(rep.role);
  const [team, setTeam] = useState(rep.team ?? "");
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  const isManager = role === "manager" || role === "admin";
  const sameModules = [...modules].sort().join() === [...(rep.modules ?? XPOT_MODULES)].sort().join();
  const dirty = role !== rep.role || (team || "") !== (rep.team || "") || !sameModules;

  const save = useMutation({
    mutationFn: () =>
      send("/api/xpot/admin/reps", { userId: rep.userId, displayName: rep.displayName, email: rep.email, role, team: team || null, modules }),
    onSuccess: () => {
      toast({ title: t("repUpdated", { name: rep.displayName }) });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  const block = useRepAction((r) => t("repBlocked", { name: r.displayName }));
  const phone = useRepAction((r) => t("repPhoneChanged", { name: r.displayName }));
  const newCode = useRepAction((r) => t("repNewCode", { name: r.displayName }));

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500/50">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {tse(ROLE_KEYS[r])}
          </option>
        ))}
      </select>
      <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("teamPlaceholder")} className={`${FIELD} w-28`} />
      <div title={isManager ? t("managersUseAllModules") : undefined}>
        <ModuleChecks value={modules} onChange={setModules} disabled={isManager} />
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending || modules.length === 0}
        className={`${BTN} bg-blue-500 text-white hover:bg-blue-600`}
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {tc("save")}
      </button>
      <button
        type="button"
        title={rep.wholesaleCode ? t("wholesaleReissueTitle", { code: rep.wholesaleCode }) : t("wholesaleIssueTitle")}
        disabled={newCode.isPending}
        onClick={() => {
          if (!rep.wholesaleCode || window.confirm(t("wholesaleConfirm", { name: rep.displayName, code: rep.wholesaleCode }))) {
            newCode.mutate({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep });
          }
        }}
        className={`${BTN} border border-white/10 font-mono text-xs text-white/60 hover:bg-white/5`}
        data-testid={`wholesale-${rep.id}`}
      >
        <KeyRound className="h-4 w-4" />
        {rep.wholesaleCode ?? t("wholesaleButton")}
      </button>
      <button
        type="button"
        title={t("changePhoneTitle")}
        disabled={phone.isPending}
        onClick={() => {
          const next = window.prompt(t("changePhonePrompt", { name: rep.displayName }), rep.loginPhone ?? "");
          if (next) phone.mutate({ url: `/api/xpot/admin/reps/${rep.id}/phone`, body: { phone: next }, rep });
        }}
        className={`${BTN} border border-white/10 text-white/60 hover:bg-white/5`}
      >
        <Phone className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={block.isPending}
        onClick={() => {
          const reason = window.prompt(t("blockPrompt", { name: rep.displayName }), "");
          if (reason !== null) block.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep });
        }}
        className={`${BTN} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
        data-testid={`block-${rep.id}`}
      >
        <Ban className="h-4 w-4" />
        {t("block")}
      </button>
    </div>
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
    </div>
  );
}

/** The admin creates someone's access directly: active, signs in with a code to this phone. */
function NewResellerForm() {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("1");
  const [phone, setPhone] = useState("");
  const [modules, setModules] = useState<string[]>(["tags"]);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => send<Rep>("/api/xpot/admin/reps/accounts", { displayName, phone, countryCode, modules }),
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
          <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="rounded-lg border border-white/10 bg-[#0a0f1e] px-2 text-sm text-white outline-none">
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} +{c.code}
              </option>
            ))}
          </select>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} type="tel" required className={FIELD} data-testid="input-reseller-phone" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs uppercase tracking-wider text-white/40">{t("modules")}</span>
        <ModuleChecks value={modules} onChange={setModules} />
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
