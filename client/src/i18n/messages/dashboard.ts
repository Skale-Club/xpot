import type { Dictionary } from "../index";

// The Visits dashboard (client/src/pages/xpot/XpotDashboard.tsx).
// Metric labels are shown on two lines, split at the first space.

const en = {
  greetingMorning: "Good morning",
  greetingAfternoon: "Good afternoon",
  greetingEvening: "Good evening",

  metricVisitsToday: "Visits Today",
  metricPipelineValue: "Pipeline Value",
  metricOpportunities: "Opportunities",
  metricPendingTasks: "Pending Tasks",

  photoUpdated: "Photo updated",
  uploadFailed: "Upload failed",
  admin: "Admin",

  visitActivity: "Sales Activity",
  last7Days: "Last 7 Days",
  today: "Today",

  syncFailures_one: "{count} Sync Failure",
  syncFailures_other: "{count} Sync Failures",
  unknownError: "Unknown error",

  recentVisits: "Recent Visits",
  recentHistory: "Recent history",
  viewHistory: "View history",
  historyTitle: "Visit history",
  historySubtitle: "Review visits, outcomes, notes and recordings.",
  backToDashboard: "Back to Dashboard",
  noVisitsYet: "No visits registered yet",
  noVisitsToday: "No visits today",
  goToCheckIn: "Go to Check-In to start your day",
  tagsTitle: "Your pieces",
  tagsInKit: "In your kit",
  tagsLive: "Live",
  tagsScans: "Scans (30 days)",
  tagsOpen: "Open Tags",

  // Sales block (profit, stock on consignment, overdue settlements)
  salesKeptMonth: "Kept this month",
  salesBilled: "{amount} billed",
  salesOnStreet: "On the street",
  salesOverdueTap_one: "{count} settlement overdue. Tap to see it",
  salesOverdueTap_other: "{count} settlements overdue. Tap to see them",
  salesOverdueClick_one: "{count} settlement overdue. Click to see it",
  salesOverdueClick_other: "{count} settlements overdue. Click to see them",
  chartBilled: "Billed",
  retrySync: "Retry sync",
};

export const dashboardMessages: Dictionary<typeof en> = {
  en,
  pt: {
    greetingMorning: "Bom dia",
    greetingAfternoon: "Boa tarde",
    greetingEvening: "Boa noite",

    metricVisitsToday: "Visitas hoje",
    metricPipelineValue: "Valor em aberto",
    metricOpportunities: "Oportunidades",
    metricPendingTasks: "Tarefas pendentes",

    photoUpdated: "Foto atualizada",
    uploadFailed: "Não foi possível enviar",
    admin: "Admin",

    visitActivity: "Atividade de vendas",
    last7Days: "Últimos 7 dias",
    today: "Hoje",

    syncFailures_one: "{count} falha de sincronização",
    syncFailures_other: "{count} falhas de sincronização",
    unknownError: "Erro desconhecido",

    recentVisits: "Visitas recentes",
    recentHistory: "Histórico recente",
    viewHistory: "Ver histórico",
    historyTitle: "Histórico de visitas",
    historySubtitle: "Consulte visitas, resultados, anotações e gravações.",
    backToDashboard: "Voltar ao Painel",
    noVisitsYet: "Nenhuma visita registrada ainda",
    noVisitsToday: "Nenhuma visita hoje",
    goToCheckIn: "Vá para Check-in para começar o dia",
    tagsTitle: "Suas peças",
    tagsInKit: "No seu kit",
    tagsLive: "No ar",
    tagsScans: "Scans (30 dias)",
    tagsOpen: "Abrir Tags",

    salesKeptMonth: "Lucro do mês",
    salesBilled: "{amount} faturado",
    salesOnStreet: "Na rua",
    salesOverdueTap_one: "{count} acerto em atraso. Toque para ver",
    salesOverdueTap_other: "{count} acertos em atraso. Toque para ver",
    salesOverdueClick_one: "{count} acerto em atraso. Clique para ver",
    salesOverdueClick_other: "{count} acertos em atraso. Clique para ver",
    chartBilled: "Faturado",
    retrySync: "Tentar sincronizar de novo",
  },
  es: {
    greetingMorning: "Buenos días",
    greetingAfternoon: "Buenas tardes",
    greetingEvening: "Buenas noches",

    metricVisitsToday: "Visitas hoy",
    metricPipelineValue: "Valor en curso",
    metricOpportunities: "Oportunidades",
    metricPendingTasks: "Tareas pendientes",

    photoUpdated: "Foto actualizada",
    uploadFailed: "No se pudo subir",
    admin: "Admin",

    visitActivity: "Actividad de ventas",
    last7Days: "Últimos 7 días",
    today: "Hoy",

    syncFailures_one: "{count} error de sincronización",
    syncFailures_other: "{count} errores de sincronización",
    unknownError: "Error desconocido",

    recentVisits: "Visitas recientes",
    recentHistory: "Historial reciente",
    viewHistory: "Ver historial",
    historyTitle: "Historial de visitas",
    historySubtitle: "Consulta visitas, resultados, notas y grabaciones.",
    backToDashboard: "Volver al Panel",
    noVisitsYet: "Aún no hay visitas registradas",
    noVisitsToday: "No hay visitas hoy",
    goToCheckIn: "Ve a Check-in para empezar el día",
    tagsTitle: "Tus piezas",
    tagsInKit: "En tu kit",
    tagsLive: "Activas",
    tagsScans: "Escaneos (30 días)",
    tagsOpen: "Abrir Etiquetas",

    salesKeptMonth: "Ganancia del mes",
    salesBilled: "{amount} facturado",
    salesOnStreet: "En la calle",
    salesOverdueTap_one: "{count} liquidación atrasada. Toca para verla",
    salesOverdueTap_other: "{count} liquidaciones atrasadas. Toca para verlas",
    salesOverdueClick_one: "{count} liquidación atrasada. Haz clic para verla",
    salesOverdueClick_other: "{count} liquidaciones atrasadas. Haz clic para verlas",
    chartBilled: "Facturado",
    retrySync: "Reintentar sincronización",
  },
};
