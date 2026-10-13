import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, Check, Circle, Clock3, Edit3, Plus, RotateCcw, Search, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useXpotQueries } from "./hooks/useXpotQueries";
import type { FullSalesLead, SalesTask } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EnrichedTask = SalesTask & {
  lead: { id: number; name: string } | null;
  assignee: { id: number; displayName: string; email: string | null } | null;
  opportunity: { id: number; title: string } | null;
};
type Member = { repId: number; displayName: string; isActive: boolean; blockedAt?: string | null };
type Form = { title: string; description: string; dueAt: string; priority: string; type: string; leadId: string; repId: string };

const emptyForm: Form = { title: "", description: "", dueAt: "", priority: "medium", type: "follow_up", leadId: "", repId: "" };
const field = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/60";
const statusLabel: Record<string, string> = { pending: "Pendente", in_progress: "Em andamento", completed: "Concluída", cancelled: "Cancelada" };
const priorityLabel: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };
const typeLabel: Record<string, string> = { follow_up: "Follow-up", call: "Ligação", visit: "Visita", send_quote: "Enviar proposta", collect_payment: "Cobrar pagamento", check_consignment: "Conferir consignação", restock: "Repor estoque", other: "Outra" };

function localInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function bucket(task: EnrichedTask) {
  if (!task.dueAt) return "Sem data";
  const due = new Date(task.dueAt);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(due); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "Atrasadas";
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return "Próximas";
}

export function XpotTasks() {
  const { me } = useXpotQueries();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("");
  const [team, setTeam] = useState(false);
  const [editing, setEditing] = useState<EnrichedTask | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const organizationId = me?.organizations?.[0]?.id;
  const canManage = Boolean(me?.user.isAdmin || me?.rep.role === "manager" || me?.rep.role === "admin" || me?.organizations?.some((org) => org.membershipRole === "admin"));

  const statusQuery = status === "open" ? "pending,in_progress" : status;
  const queryKey = [`/api/xpot/tasks?status=${statusQuery}${priority ? `&priority=${priority}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}${team ? "&all=true" : ""}`];
  const tasks = useQuery<EnrichedTask[]>({ queryKey, refetchOnMount: true });
  const leads = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], enabled: open });
  const members = useQuery<Member[]>({ queryKey: [`/api/xpot/organizations/${organizationId}/members`], enabled: open && canManage && Boolean(organizationId) });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title,
        description: form.description || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        priority: form.priority,
        type: form.type,
        leadId: form.leadId ? Number(form.leadId) : null,
        ...(form.repId ? { repId: Number(form.repId) } : {}),
      };
      const response = await apiRequest(editing ? "PATCH" : "POST", editing ? `/api/xpot/tasks/${editing.id}` : "/api/xpot/tasks", body);
      return response.json();
    },
    onSuccess: async () => {
      setOpen(false); setEditing(null); setForm(emptyForm);
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      toast({ title: editing ? "Tarefa atualizada" : "Tarefa criada", variant: "success" });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => (await apiRequest("POST", `/api/xpot/tasks/${id}/${action}`)).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/xpot/tasks") });
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    },
    onError: (error: Error) => toast({ title: "Não foi possível alterar a tarefa", description: error.message, variant: "destructive" }),
  });

  const groups = useMemo(() => {
    const order = ["Atrasadas", "Hoje", "Amanhã", "Próximas", "Sem data"];
    const map = new Map<string, EnrichedTask[]>();
    for (const task of tasks.data ?? []) map.set(bucket(task), [...(map.get(bucket(task)) ?? []), task]);
    return order.flatMap((name) => map.has(name) ? [{ name, tasks: map.get(name)! }] : []);
  }, [tasks.data]);

  function newTask() { setEditing(null); setForm({ ...emptyForm, repId: String(me?.rep.id ?? "") }); setOpen(true); }
  function editTask(task: EnrichedTask) {
    setEditing(task);
    setForm({ title: task.title, description: task.description ?? "", dueAt: localInput(task.dueAt), priority: task.priority, type: task.type, leadId: String(task.leadId ?? ""), repId: String(task.repId) });
    setOpen(true);
  }

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/70">Execução</p><h1 className="mt-1 text-2xl font-bold text-white">Tarefas</h1><p className="mt-1 text-sm text-white/45">Follow-ups manuais, por áudio e por IA em uma única fila.</p></div>
      <button onClick={newTask} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"><Plus className="h-4 w-4" /> Nova tarefa</button>
    </div>

    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-white/30" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefa…" className={`${field} pl-9`} /></label>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}><option value="open">Em aberto</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select>
      <select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}><option value="">Todas prioridades</option>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {canManage && <button onClick={() => setTeam((value) => !value)} className={`rounded-xl border px-4 py-2 text-sm font-medium ${team ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-200" : "border-white/10 text-white/60"}`}>{team ? "Equipe inteira" : "Minhas"}</button>}
    </div>

    {tasks.isLoading ? <div className="py-16 text-center text-white/40">Carregando tarefas…</div> : groups.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center"><Circle className="mx-auto mb-3 h-8 w-8 text-white/20" /><p className="font-medium text-white/70">Nenhuma tarefa nesta fila</p></div> : groups.map((group) => <section key={group.name} className="space-y-2">
      <div className="flex items-center gap-2 px-1"><h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{group.name}</h2><span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/35">{group.tasks.length}</span></div>
      <div className="grid gap-2 lg:grid-cols-2">{group.tasks.map((task) => <article key={task.id} className={`group rounded-2xl border p-4 transition ${group.name === "Atrasadas" ? "border-red-400/20 bg-red-500/[0.04]" : "border-white/8 bg-white/[0.025] hover:border-white/15"}`}>
        <div className="flex items-start gap-3">
          <button aria-label="Concluir" onClick={() => changeStatus.mutate({ id: task.id, action: task.status === "completed" ? "reopen" : "complete" })} className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${task.status === "completed" ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-transparent hover:border-emerald-400 hover:text-emerald-400"}`}><Check className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${task.status === "completed" ? "text-white/35 line-through" : "text-white"}`}>{task.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${task.priority === "urgent" ? "bg-red-500/15 text-red-300" : task.priority === "high" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-white/40"}`}>{priorityLabel[task.priority]}</span></div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">{task.dueAt && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{new Date(task.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>}{task.lead && <span>{task.lead.name}</span>}{team && task.assignee && <span>→ {task.assignee.displayName}</span>}<span>{statusLabel[task.status]}</span></div>
            {task.description && <p className="mt-2 line-clamp-2 text-sm text-white/50">{task.description}</p>}
          </div>
          <button onClick={() => editTask(task)} aria-label="Editar" className="rounded-lg p-2 text-white/30 hover:bg-white/5 hover:text-white"><Edit3 className="h-4 w-4" /></button>
        </div>
        {task.status !== "completed" && task.status !== "cancelled" && <div className="mt-3 flex justify-end gap-2 border-t border-white/5 pt-3">{task.status === "pending" && <button onClick={() => changeStatus.mutate({ id: task.id, action: "start" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><Clock3 className="h-3 w-3" /> Iniciar</button>}<button onClick={() => changeStatus.mutate({ id: task.id, action: "cancel" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/35 hover:bg-white/5"><X className="h-3 w-3" /> Cancelar</button></div>}
        {(task.status === "completed" || task.status === "cancelled") && <div className="mt-3 flex justify-end border-t border-white/5 pt-3"><button onClick={() => changeStatus.mutate({ id: task.id, action: "reopen" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/10"><RotateCcw className="h-3 w-3" /> Reabrir</button></div>}
      </article>)}</div>
    </section>)}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="border-white/10 bg-[#0b1020] text-white"><DialogHeader><DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader><form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      <label className="block text-xs font-medium text-white/55">Título<input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${field} mt-1.5`} /></label>
      <label className="block text-xs font-medium text-white/55">Descrição<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${field} mt-1.5 resize-none`} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium text-white/55">Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${field} mt-1.5`}>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-medium text-white/55">Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${field} mt-1.5`}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <label className="block text-xs font-medium text-white/55">Prazo<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} className={`${field} mt-1.5`} /></label>
      <label className="block text-xs font-medium text-white/55">Cliente<select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} className={`${field} mt-1.5`}><option value="">Sem cliente</option>{(leads.data ?? []).map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
      {canManage && <label className="block text-xs font-medium text-white/55">Responsável<select value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className={`${field} mt-1.5`}>{(members.data ?? [{ repId: me!.rep.id, displayName: me!.rep.displayName, isActive: true }]).filter((member) => member.isActive && !member.blockedAt).map((member) => <option key={member.repId} value={member.repId}>{member.displayName}</option>)}</select></label>}
      {save.isError && <p className="flex gap-2 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{save.error.message}</p>}
      <button disabled={save.isPending || !form.title.trim()} className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{save.isPending ? "Salvando…" : "Salvar tarefa"}</button>
    </form></DialogContent></Dialog>
  </div>;
}
