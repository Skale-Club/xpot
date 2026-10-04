import { useState } from "react";
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
