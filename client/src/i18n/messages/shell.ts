import type { Dictionary } from "../index";

// The Visits app frame: bottom-nav tabs (client/src/App.tsx) and the shared
// formatters in client/src/pages/xpot/utils.ts.

const en = {
  // Bottom navigation
  tabCheckIn: "Check-In",
  tabVisits: "Visits",
  tabLeads: "Leads",
  tabSales: "Sales",
  tabDashboard: "Dashboard",

  // Formatters
  notSet: "Not set",
  durationMinutes: "{minutes}m",
  durationHours: "{hours}h {minutes}m",
};

export const shellMessages: Dictionary<typeof en> = {
  en,
  pt: {
    tabCheckIn: "Check-in",
    tabVisits: "Visitas",
    tabLeads: "Clientes",
    tabSales: "Vendas",
    tabDashboard: "Painel",

    notSet: "Não definido",
    durationMinutes: "{minutes}min",
    durationHours: "{hours}h {minutes}min",
  },
  es: {
    tabCheckIn: "Check-in",
    tabVisits: "Visitas",
    tabLeads: "Clientes",
    tabSales: "Ventas",
    tabDashboard: "Panel",

    notSet: "Sin definir",
    durationMinutes: "{minutes} min",
    durationHours: "{hours} h {minutes} min",
  },
};
