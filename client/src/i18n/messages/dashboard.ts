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

  visitActivity: "Visit Activity",
  last7Days: "Last 7 Days",
  today: "Today",

  syncFailures_one: "{count} Sync Failure",
  syncFailures_other: "{count} Sync Failures",
  unknownError: "Unknown error",

  recentVisits: "Recent Visits",
  noVisitsToday: "No visits today",
  goToCheckIn: "Go to Check-In to start your day",
  tagsTitle: "Your tags",
  tagsInKit: "In your kit",
  tagsLive: "Live",
  tagsScans: "Scans (30 days)",
  tagsOpen: "Open Tags",
};

export const dashboardMessages: Dictionary<typeof en> = {
  en,
  pt: {
    greetingMorning: "Bom dia",
    greetingAfternoon: "Boa tarde",
    greetingEvening: "Boa noite",

    metricVisitsToday: "Visitas hoje",
    metricPipelineValue: "Valor em aberto",
    metricOpportunities: "Negócios",
    metricPendingTasks: "Tarefas pendentes",

    photoUpdated: "Foto atualizada",
    uploadFailed: "Não foi possível enviar",
    admin: "Admin",

    visitActivity: "Suas visitas",
    last7Days: "Últimos 7 dias",
    today: "Hoje",

    syncFailures_one: "{count} falha de sincronização",
    syncFailures_other: "{count} falhas de sincronização",
    unknownError: "Erro desconhecido",

    recentVisits: "Visitas recentes",
    noVisitsToday: "Nenhuma visita hoje",
    goToCheckIn: "Vá para Check-in para começar o dia",
    tagsTitle: "Suas tags",
    tagsInKit: "No seu kit",
    tagsLive: "No ar",
    tagsScans: "Scans (30 dias)",
    tagsOpen: "Abrir Tags",
  },
  es: {
    greetingMorning: "Buenos días",
    greetingAfternoon: "Buenas tardes",
    greetingEvening: "Buenas noches",

    metricVisitsToday: "Visitas hoy",
    metricPipelineValue: "Valor en curso",
    metricOpportunities: "Negocios",
    metricPendingTasks: "Tareas pendientes",

    photoUpdated: "Foto actualizada",
    uploadFailed: "No se pudo subir",
    admin: "Admin",

    visitActivity: "Tus visitas",
    last7Days: "Últimos 7 días",
    today: "Hoy",

    syncFailures_one: "{count} error de sincronización",
    syncFailures_other: "{count} errores de sincronización",
    unknownError: "Error desconocido",

    recentVisits: "Visitas recientes",
    noVisitsToday: "No hay visitas hoy",
    goToCheckIn: "Ve a Check-in para empezar el día",
    tagsTitle: "Tus etiquetas",
    tagsInKit: "En tu kit",
    tagsLive: "Activas",
    tagsScans: "Escaneos (30 días)",
    tagsOpen: "Abrir Etiquetas",
  },
};
