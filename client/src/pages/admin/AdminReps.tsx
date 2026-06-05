import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";

type Rep = {
  id: number;
  userId: string | null;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
};

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
    return <p className="text-sm text-red-400">Falha ao carregar reps.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/50">
        Gerencie papel, equipe e status dos representantes. Reps são criados automaticamente no primeiro login.
      </p>
      {query.data.length === 0 && <p className="text-sm text-white/40">Nenhum representante ainda.</p>}
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

  const dirty = role !== rep.role || (team || "") !== (rep.team || "") || isActive !== rep.isActive;

  const save = useMutation({
    mutationFn: async () => {
      if (!rep.userId) throw new Error("Rep sem usuário vinculado.");
      const res = await apiRequest("POST", "/api/xpot/admin/reps", {
        userId: rep.userId,
        displayName: rep.displayName,
        email: rep.email,
        role,
        team: team || null,
        isActive,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `${rep.displayName} atualizado` });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/reps"] });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
        placeholder="equipe"
        className="w-28 rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50"
      />

      <label className="flex cursor-pointer items-center gap-1.5 text-sm text-white/70">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-blue-500" />
        ativo
      </label>

      <button
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar
      </button>
    </div>
  );
}
