import { useState, type FormEvent } from "react";
import { Copy, KeyRound, UserPlus, Wand2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { XPOT_MODULES, type XpotModule } from "@shared/modules";

type Rep = {
  id: number;
  userId: string | null;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[];
};

const MODULE_LABELS: Record<XpotModule, string> = { visits: "Visits", tags: "Tags" };

const ROLES = ["rep", "manager", "admin"] as const;

export function AdminReps() {
  const query = useQuery<Rep[]>({ queryKey: ["/api/xpot/admin/reps"] });

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

  return (
    <div className="space-y-3">
      <NewResellerForm />
      <p className="text-sm text-white/50">
        Manage reps' role, team, status and modules. Reps are created automatically on first login, switched
        off until you turn them on. Managers and admins always get every module.
      </p>
      {query.data.length === 0 && <p className="text-sm text-white/40">No reps yet.</p>}
      {query.data.map((rep) => (
        <RepRow key={rep.id} rep={rep} />
      ))}
    </div>
  );
}

const FIELD =
  "w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50";

/** Readable random password: no look-alike characters, easy to type from a WhatsApp message. */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function loginMessage(name: string, email: string, password: string): string {
  return [`Hi ${name.split(" ")[0]}! Your Xpot access:`, window.location.origin, `Email: ${email}`, `Password: ${password}`].join("\n");
}

/** The admin creates the reseller's login; the first sign-in lands straight in the app. */
function NewResellerForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [phone, setPhone] = useState("");
  const [modules, setModules] = useState<string[]>(["tags"]);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/xpot/admin/reps/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password, phone: phone || null, modules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not create the account");
      return data;
    },
    onSuccess: () => {
      setCreated(loginMessage(displayName, email.trim().toLowerCase(), password));
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/reps"] });
      toast({ title: `${displayName} can sign in now` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setPhone("");
    setPassword(generatePassword());
    setModules(["tags"]);
    setCreated(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        data-testid="button-new-reseller"
      >
        <UserPlus className="h-4 w-4" />
        New reseller
      </button>
    );
  }

  if (created) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4" data-testid="reseller-created">
        <p className="text-sm font-semibold text-emerald-200">Account created. Send these details to the reseller (e.g. on WhatsApp):</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-sm text-white">{created}</pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(created).then(() => toast({ title: "Copied" }))}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
          >
            <Copy className="h-4 w-4" />
            Copy message
          </button>
          <button type="button" onClick={reset} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5">
            Create another
          </button>
          <button type="button" onClick={() => { reset(); setOpen(false); }} className="rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white/80">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-blue-500/25 bg-blue-500/[0.04] p-4" data-testid="new-reseller-form">
      <p className="text-sm font-semibold text-white">New reseller</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" required className={FIELD} data-testid="input-reseller-name" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className={FIELD} data-testid="input-reseller-email" />
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" minLength={8} required className={`${FIELD} font-mono`} data-testid="input-reseller-password" />
          <button type="button" onClick={() => setPassword(generatePassword())} title="Generate a password" className="rounded-lg border border-white/10 px-2.5 text-white/60 hover:bg-white/5">
            <Wand2 className="h-4 w-4" />
          </button>
        </div>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone / WhatsApp (optional)" className={FIELD} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs uppercase tracking-wider text-white/40">Modules</span>
        {XPOT_MODULES.map((module) => (
          <label key={module} className="flex cursor-pointer items-center gap-1.5 text-sm text-white/70">
            <input
              type="checkbox"
              checked={modules.includes(module)}
              onChange={(e) => setModules((m) => (e.target.checked ? (m.includes(module) ? m : [...m, module]) : m.filter((x) => x !== module)))}
              className="h-4 w-4 accent-blue-500"
            />
            {MODULE_LABELS[module]}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || modules.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
          data-testid="button-create-reseller"
        >
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/50 hover:text-white/80">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Sets a new password for a rep who forgot theirs. */
function PasswordButton({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const change = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`/api/xpot/admin/reps/${rep.id}/password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not change the password");
      return password;
    },
    onSuccess: (password) => {
      const message = loginMessage(rep.displayName, rep.email ?? "", password);
      void navigator.clipboard?.writeText(message).catch(() => undefined);
      toast({ title: "Password changed", description: `New password: ${password} (login message copied)` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <button
      type="button"
      title="Set a new password"
      onClick={() => {
        const next = window.prompt(`New password for ${rep.displayName} (8+ characters)`, generatePassword());
        if (next) change.mutate(next);
      }}
      disabled={!rep.userId || change.isPending}
      className="rounded-lg border border-white/10 p-1.5 text-white/50 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30"
    >
      {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
    </button>
  );
}

function RepRow({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState(rep.role);
  const [team, setTeam] = useState(rep.team ?? "");
  const [isActive, setIsActive] = useState(rep.isActive);
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  const isManager = role === "manager" || role === "admin";

  const sameModules = [...modules].sort().join() === [...(rep.modules ?? XPOT_MODULES)].sort().join();
  const dirty = role !== rep.role || (team || "") !== (rep.team || "") || isActive !== rep.isActive || !sameModules;

  const toggleModule = (module: XpotModule, on: boolean) =>
    setModules((current) => (on ? (current.includes(module) ? current : [...current, module]) : current.filter((m) => m !== module)));

  const save = useMutation({
    mutationFn: async () => {
      if (!rep.userId) throw new Error("Rep has no linked user.");
      const res = await apiRequest("POST", "/api/xpot/admin/reps", {
        userId: rep.userId,
        displayName: rep.displayName,
        email: rep.email,
        role,
        team: team || null,
        isActive,
        modules,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `${rep.displayName} updated` });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/reps"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{rep.displayName}</p>
        <p className="truncate text-xs text-white/40">{rep.email ?? "—"}</p>
      </div>

      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500/50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <input
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="team"
        className="w-28 rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50"
      />

      <label className="flex cursor-pointer items-center gap-1.5 text-sm text-white/70">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-blue-500" />
        active
      </label>

      <div className="flex items-center gap-3" title={isManager ? "Managers and admins use every module" : undefined}>
        {XPOT_MODULES.map((module) => (
          <label key={module} className={`flex items-center gap-1.5 text-sm ${isManager ? "text-white/35" : "cursor-pointer text-white/70"}`}>
            <input
              type="checkbox"
              checked={isManager || modules.includes(module)}
              disabled={isManager}
              onChange={(e) => toggleModule(module, e.target.checked)}
              className="h-4 w-4 accent-blue-500"
              data-testid={`rep-${rep.id}-module-${module}`}
            />
            {MODULE_LABELS[module]}
          </label>
        ))}
      </div>

      <PasswordButton rep={rep} />

      <button
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending || modules.length === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save
      </button>
    </div>
  );
}
