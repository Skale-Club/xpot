import { useState, type FormEvent } from "react";
import { Ban, Check, Copy, KeyRound, Phone, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { XPOT_MODULES, type XpotModule } from "@shared/modules";
import { PHONE_COUNTRIES, formatPhone } from "@shared/phone";
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
const MODULE_LABELS: Record<XpotModule, string> = { visits: "Visits", tags: "Tags" };
const ROLES = ["rep", "manager", "admin"] as const;
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
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data as T;
}

function useRepAction(successTitle: (rep: Rep) => string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown; rep: Rep }) => send(url, body),
    onSuccess: (_data, { rep }) => {
      toast({ title: successTitle(rep) });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

function welcomeMessage(name: string, phone: string): string {
  return [
    `Hi ${name.split(" ")[0]}! Your Xpot access is ready.`,
    window.location.origin,
    `Sign in with your phone number ${formatPhone(phone)}: you'll get a code by SMS.`,
  ].join("\n");
}

function ModuleChecks({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
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
          {MODULE_LABELS[module]}
        </label>
      ))}
    </div>
  );
}

export function AdminReps() {
  const query = useQuery<Rep[]>({ queryKey: REPS_KEY });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">Failed to load reps.</p>;
  }

  const pending = query.data.filter((r) => r.access === "pending");
  const active = query.data.filter((r) => r.access === "active");
  const blocked = query.data.filter((r) => r.access === "blocked");

  return (
    <div className="space-y-6">
      <NewResellerForm />

      <section className="space-y-3" data-testid="reps-pending">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300/80">
          Waiting for approval {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-white/40">Nobody waiting. New sign-ups show up here.</p>
        ) : (
          pending.map((rep) => <PendingRow key={rep.id} rep={rep} />)
        )}
      </section>

      <section className="space-y-3" data-testid="reps-active">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Active ({active.length})</h2>
        <p className="text-xs text-white/40">Managers and admins always get every module.</p>
        {active.map((rep) => (
          <ActiveRow key={rep.id} rep={rep} />
        ))}
      </section>

      {blocked.length > 0 && (
        <section className="space-y-3" data-testid="reps-blocked">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-red-300/70">Blocked ({blocked.length})</h2>
          {blocked.map((rep) => (
            <BlockedRow key={rep.id} rep={rep} />
          ))}
        </section>
      )}
    </div>
  );
}

function Identity({ rep }: { rep: Rep }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{rep.displayName}</p>
      <p className="truncate text-xs text-white/40">
        {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">no sign-in phone</span>}
        {rep.email ? ` · ${rep.email}` : ""}
      </p>
    </div>
  );
}

function PendingRow({ rep }: { rep: Rep }) {
  const [modules, setModules] = useState<string[]>(rep.modules?.length ? rep.modules : [...XPOT_MODULES]);
  const approve = useRepAction((r) => `${r.displayName} can sign in now`);
  const refuse = useRepAction((r) => `${r.displayName} refused`);
  const busy = approve.isPending || refuse.isPending;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      {rep.createdAt && <span className="text-xs text-white/35">signed up {new Date(rep.createdAt).toLocaleDateString()}</span>}
      <ModuleChecks value={modules} onChange={setModules} />
      <button
        type="button"
        disabled={busy || modules.length === 0}
        onClick={() => approve.mutate({ url: `/api/xpot/admin/reps/${rep.id}/approve`, body: { modules }, rep })}
        className={`${BTN} bg-emerald-500 text-white hover:bg-emerald-600`}
        data-testid={`approve-${rep.id}`}
      >
        {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const reason = window.prompt(`Refuse ${rep.displayName}'s sign-up? Optional note (only admins see it):`, "");
          if (reason !== null) refuse.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || "Sign-up refused" }, rep });
        }}
        className={`${BTN} border border-white/10 text-white/60 hover:bg-white/5`}
      >
        Refuse
      </button>
    </div>
  );
}

function ActiveRow({ rep }: { rep: Rep }) {
  const { toast } = useToast();
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
      toast({ title: `${rep.displayName} updated` });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const block = useRepAction((r) => `${r.displayName} blocked and signed out`);
  const phone = useRepAction((r) => `${r.displayName}'s sign-in phone changed`);
  const newCode = useRepAction((r) => `New wholesale code for ${r.displayName}; the old one no longer works`);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500/50">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="team" className={`${FIELD} w-28`} />
      <div title={isManager ? "Managers and admins use every module" : undefined}>
        <ModuleChecks value={modules} onChange={setModules} disabled={isManager} />
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending || modules.length === 0}
        className={`${BTN} bg-blue-500 text-white hover:bg-blue-600`}
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save
      </button>
      <button
        type="button"
        title={rep.wholesaleCode ? `Wholesale code ${rep.wholesaleCode}: issue a new one` : "Issue a wholesale code"}
        disabled={newCode.isPending}
        onClick={() => {
          if (!rep.wholesaleCode || window.confirm(`Issue a new wholesale code for ${rep.displayName}? ${rep.wholesaleCode} stops working in the Stuscle store.`)) {
            newCode.mutate({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep });
          }
        }}
        className={`${BTN} border border-white/10 font-mono text-xs text-white/60 hover:bg-white/5`}
        data-testid={`wholesale-${rep.id}`}
      >
        <KeyRound className="h-4 w-4" />
        {rep.wholesaleCode ?? "code"}
      </button>
      <button
        type="button"
        title="Change the phone they sign in with"
        disabled={phone.isPending}
        onClick={() => {
          const next = window.prompt(`New sign-in phone for ${rep.displayName} (US numbers as is, others with +country code):`, rep.loginPhone ?? "");
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
          const reason = window.prompt(`Block ${rep.displayName}? They lose access and are signed out now. Optional reason:`, "");
          if (reason !== null) block.mutate({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep });
        }}
        className={`${BTN} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
        data-testid={`block-${rep.id}`}
      >
        <Ban className="h-4 w-4" />
        Block
      </button>
    </div>
  );
}

type DeletionResult = { account: "deleted" | "anonymized"; leadsDeleted: number; leadsUnassigned: number; visitsDeleted: number; files: { deleted: number; failed: number } };

/** Delete the account and its data, when the person asks (privacy policy, "How long we keep it"). */
function DeleteAccountButton({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const remove = useMutation({
    mutationFn: () => send<DeletionResult>(`/api/xpot/admin/reps/${rep.id}`, { confirm: "DELETE" }, "DELETE"),
    onSuccess: (r) => {
      const kept = r.leadsUnassigned ? ` ${r.leadsUnassigned} business(es) with sales records kept, now unassigned.` : "";
      const files = r.files.failed ? ` ${r.files.failed} file(s) could not be deleted; see the server log.` : "";
      toast({
        title: `${rep.displayName}'s account deleted`,
        description: `${r.leadsDeleted} business(es), ${r.visitsDeleted} visit(s) and ${r.files.deleted} file(s) deleted.${kept}${files}`,
        variant: r.files.failed ? "destructive" : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (!me?.user.isAdmin) return null;
  return (
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => {
        const typed = window.prompt(
          `Delete ${rep.displayName}'s account and data? This cannot be undone.\n\n` +
            "Deleted: sign-in, profile, their visits, notes, voice notes, photos, tasks and the businesses they own. " +
            "Kept for accounting: sales and consignments (a business with those stays, unassigned).\n\nType DELETE to confirm:",
          "",
        );
        if (typed === "DELETE") remove.mutate();
        else if (typed !== null) toast({ title: "Not deleted", description: "Type DELETE, in capitals, to confirm." });
      }}
      className={`${BTN} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
      data-testid={`delete-${rep.id}`}
    >
      {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Delete account
    </button>
  );
}

function BlockedRow({ rep }: { rep: Rep }) {
  const unblock = useRepAction((r) => `${r.displayName} can sign in again`);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-4 opacity-80" data-testid={`rep-${rep.id}`}>
      <Identity rep={rep} />
      <span className="text-xs text-white/40">
        blocked {rep.blockedAt ? new Date(rep.blockedAt).toLocaleDateString() : ""}
        {rep.blockedReason ? ` · ${rep.blockedReason}` : ""}
      </span>
      <button
        type="button"
        disabled={unblock.isPending}
        onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
        className={`${BTN} border border-white/10 text-white/70 hover:bg-white/5`}
      >
        <RotateCcw className="h-4 w-4" />
        Unblock
      </button>
      <DeleteAccountButton rep={rep} />
    </div>
  );
}

/** The admin creates someone's access directly: active, signs in with a code to this phone. */
function NewResellerForm() {
  const { toast } = useToast();
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
      setCreated(welcomeMessage(displayName, rep.phone ?? phone));
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      toast({ title: `${displayName} can sign in now` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
        New reseller
      </button>
    );
  }

  if (created) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4" data-testid="reseller-created">
        <p className="text-sm font-semibold text-emerald-200">Access created. Send this to the reseller (e.g. on WhatsApp):</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-sm text-white">{created}</pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(created).then(() => toast({ title: "Copied" }))}
            className={`${BTN} bg-emerald-500 py-2 text-white hover:bg-emerald-600`}
          >
            <Copy className="h-4 w-4" />
            Copy message
          </button>
          <button type="button" onClick={reset} className={`${BTN} border border-white/10 py-2 text-white/70 hover:bg-white/5`}>
            Create another
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className={`${BTN} py-2 text-white/50 hover:text-white/80`}
          >
            Close
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
      <p className="text-sm font-semibold text-white">New reseller</p>
      <p className="text-xs text-white/50">Their access is on right away; they sign in with a code texted to this phone.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" required className={FIELD} data-testid="input-reseller-name" />
        <div className="flex gap-2">
          <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="rounded-lg border border-white/10 bg-[#0a0f1e] px-2 text-sm text-white outline-none">
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} +{c.code}
              </option>
            ))}
          </select>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (sign-in)" type="tel" required className={FIELD} data-testid="input-reseller-phone" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs uppercase tracking-wider text-white/40">Modules</span>
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
          Create access
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${BTN} py-2 text-white/50 hover:text-white/80`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
