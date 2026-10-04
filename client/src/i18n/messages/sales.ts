import type { Dictionary } from "../index";

// Opportunities and follow-up tasks (client/src/pages/xpot/XpotSales.tsx,
// hooks/useSales.ts). An opportunity is a "venda" / "venta"; a lead is a
// "cliente".

const en = {
  // Lead picker
  chooseLead: "Choose a lead",
  searchLeads: "Search leads...",
  noLeadsFound: "No leads found",
  leadNumber: "Lead #{id}",

  // Opportunities
  opportunities: "Opportunities",
  oppTitle: "Opportunity title",
  oppValue: "Value ($)",
  loadingPipelines: "Loading pipelines...",
  pipeline: "Pipeline",
  stage: "Stage",
  noPipelines: "No pipelines configured in GHL",
  createOpp: "Create Opportunity",
  noOpps: "No opportunities yet — tap + to create one",
  sync_pending: "Pending",
  sync_synced: "Synced",
  sync_failed: "Failed",
  sync_needs_review: "Needs review",

  // Tasks
  followUpTasks: "Follow-Up Tasks",
  taskTitle: "Task title",
  createTask: "Create Task",
  noDueDate: "No due date",
  noTasks: "No tasks yet — tap + to add a follow-up",

  // Toasts
  oppCreated: "Opportunity created",
  oppCreateFailed: "Failed to create opportunity",
  taskCreated: "Task created",
  taskCreateFailed: "Failed to create task",
  taskUpdated: "Task updated",
  taskUpdateFailed: "Failed to update task",
  tabOverview: "Overview",
  tabSales: "Sales",
  tabStock: "Stock",
  tabPipeline: "Pipeline",
};

export const salesMessages: Dictionary<typeof en> = {
  en,
  pt: {
    chooseLead: "Escolha o cliente",
    searchLeads: "Buscar clientes...",
    noLeadsFound: "Nenhum cliente encontrado",
    leadNumber: "Cliente #{id}",

    opportunities: "Vendas",
    oppTitle: "Nome da venda",
    oppValue: "Valor ($)",
    loadingPipelines: "Carregando funis...",
    pipeline: "Funil",
    stage: "Etapa",
    noPipelines: "Nenhum funil configurado no GHL",
    createOpp: "Criar venda",
    noOpps: "Nenhuma venda ainda — toque em + para criar",
    sync_pending: "Pendente",
    sync_synced: "Sincronizada",
    sync_failed: "Falhou",
    sync_needs_review: "Precisa revisar",

    followUpTasks: "Tarefas de acompanhamento",
    taskTitle: "Nome da tarefa",
    createTask: "Criar tarefa",
    noDueDate: "Sem prazo",
    noTasks: "Nenhuma tarefa ainda — toque em + para adicionar um acompanhamento",

    oppCreated: "Venda criada",
    oppCreateFailed: "Não foi possível criar a venda",
    taskCreated: "Tarefa criada",
    taskCreateFailed: "Não foi possível criar a tarefa",
    taskUpdated: "Tarefa atualizada",
    taskUpdateFailed: "Não foi possível atualizar a tarefa",
    tabOverview: "Resumo",
    tabSales: "Vendas",
    tabStock: "Estoque",
    tabPipeline: "Pipeline",
  },
  es: {
    chooseLead: "Elige el cliente",
    searchLeads: "Buscar clientes...",
    noLeadsFound: "No se encontraron clientes",
    leadNumber: "Cliente #{id}",

    opportunities: "Ventas",
    oppTitle: "Nombre de la venta",
    oppValue: "Valor ($)",
    loadingPipelines: "Cargando embudos...",
    pipeline: "Embudo",
    stage: "Etapa",
    noPipelines: "No hay embudos configurados en GHL",
    createOpp: "Crear venta",
    noOpps: "Aún no hay ventas — toca + para crear una",
    sync_pending: "Pendiente",
    sync_synced: "Sincronizada",
    sync_failed: "Falló",
    sync_needs_review: "Requiere revisión",

    followUpTasks: "Tareas de seguimiento",
    taskTitle: "Nombre de la tarea",
    createTask: "Crear tarea",
    noDueDate: "Sin fecha límite",
    noTasks: "Aún no hay tareas — toca + para agregar un seguimiento",

    oppCreated: "Venta creada",
    oppCreateFailed: "No se pudo crear la venta",
    taskCreated: "Tarea creada",
    taskCreateFailed: "No se pudo crear la tarea",
    taskUpdated: "Tarea actualizada",
    taskUpdateFailed: "No se pudo actualizar la tarea",
    tabOverview: "Resumen",
    tabSales: "Ventas",
    tabStock: "Inventario",
    tabPipeline: "Pipeline",
  },
};
