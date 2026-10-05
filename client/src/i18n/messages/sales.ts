import type { Dictionary } from "../index";

// The Sales tabs and the GHL pipeline tab: opportunities and follow-up tasks
// (client/src/pages/xpot/XpotSales.tsx, hooks/useSales.ts). An opportunity is
// an "oportunidade" / "oportunidad" (a "venda" / "venta" is a recorded sale,
// see salesModule.ts); a pipeline is a "funil" / "embudo"; a lead is a
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
  newOpp: "New opportunity",
  newTask: "New task",
  markTaskDone: "Mark task as done",
};

export const salesMessages: Dictionary<typeof en> = {
  en,
  pt: {
    chooseLead: "Escolha o cliente",
    searchLeads: "Buscar clientes...",
    noLeadsFound: "Nenhum cliente encontrado",
    leadNumber: "Cliente #{id}",

    opportunities: "Oportunidades",
    oppTitle: "Nome da oportunidade",
    oppValue: "Valor ($)",
    loadingPipelines: "Carregando funis...",
    pipeline: "Funil",
    stage: "Etapa",
    noPipelines: "Nenhum funil configurado no GHL",
    createOpp: "Criar oportunidade",
    noOpps: "Nenhuma oportunidade ainda — toque em + para criar",
    sync_pending: "Pendente",
    sync_synced: "Sincronizada",
    sync_failed: "Falhou",
    sync_needs_review: "Precisa revisar",

    followUpTasks: "Tarefas de acompanhamento",
    taskTitle: "Nome da tarefa",
    createTask: "Criar tarefa",
    noDueDate: "Sem prazo",
    noTasks: "Nenhuma tarefa ainda — toque em + para adicionar um acompanhamento",

    oppCreated: "Oportunidade criada",
    oppCreateFailed: "Não foi possível criar a oportunidade",
    taskCreated: "Tarefa criada",
    taskCreateFailed: "Não foi possível criar a tarefa",
    taskUpdated: "Tarefa atualizada",
    taskUpdateFailed: "Não foi possível atualizar a tarefa",
    tabOverview: "Resumo",
    tabSales: "Vendas",
    tabStock: "Estoque",
    tabPipeline: "Funil",
    newOpp: "Nova oportunidade",
    newTask: "Nova tarefa",
    markTaskDone: "Marcar tarefa como feita",
  },
  es: {
    chooseLead: "Elige el cliente",
    searchLeads: "Buscar clientes...",
    noLeadsFound: "No se encontraron clientes",
    leadNumber: "Cliente #{id}",

    opportunities: "Oportunidades",
    oppTitle: "Nombre de la oportunidad",
    oppValue: "Valor ($)",
    loadingPipelines: "Cargando embudos...",
    pipeline: "Embudo",
    stage: "Etapa",
    noPipelines: "No hay embudos configurados en GHL",
    createOpp: "Crear oportunidad",
    noOpps: "Aún no hay oportunidades — toca + para crear una",
    sync_pending: "Pendiente",
    sync_synced: "Sincronizada",
    sync_failed: "Falló",
    sync_needs_review: "Requiere revisión",

    followUpTasks: "Tareas de seguimiento",
    taskTitle: "Nombre de la tarea",
    createTask: "Crear tarea",
    noDueDate: "Sin fecha límite",
    noTasks: "Aún no hay tareas — toca + para agregar un seguimiento",

    oppCreated: "Oportunidad creada",
    oppCreateFailed: "No se pudo crear la oportunidad",
    taskCreated: "Tarea creada",
    taskCreateFailed: "No se pudo crear la tarea",
    taskUpdated: "Tarea actualizada",
    taskUpdateFailed: "No se pudo actualizar la tarea",
    tabOverview: "Resumen",
    tabSales: "Ventas",
    tabStock: "Stock",
    tabPipeline: "Embudo",
    newOpp: "Nueva oportunidad",
    newTask: "Nueva tarea",
    markTaskDone: "Marcar tarea como hecha",
  },
};
