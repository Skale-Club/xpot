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

  // Desktop sidebar and top bar
  navSettings: "Settings",
  navAdmin: "Admin",
  signOut: "Sign out",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
  online: "Online",
  offline: "Offline",
  activeVisit: "Visit in progress",
  activeVisitAt: "Visit in progress at {lead}",
  openVisit: "Open visit",
  searchEverything: "Search",
  palettePlaceholder: "Search companies, pieces or pages…",
  paletteEmpty: "Nothing matches.",
  groupPages: "Pages",
  groupCompanies: "Companies",
  groupPieces: "Pieces",
  paletteHint: "↑↓ move · Enter open · Esc close",
  shortcutsHint: "Shortcuts: / search · N new · J/K next/previous row · Esc close",
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

    navSettings: "Configurações",
    navAdmin: "Admin",
    signOut: "Sair",
    collapseSidebar: "Recolher menu",
    expandSidebar: "Expandir menu",
    online: "Online",
    offline: "Offline",
    activeVisit: "Visita em andamento",
    activeVisitAt: "Visita em andamento em {lead}",
    openVisit: "Abrir visita",
    searchEverything: "Buscar",
    palettePlaceholder: "Buscar empresas, peças ou telas…",
    paletteEmpty: "Nada encontrado.",
    groupPages: "Telas",
    groupCompanies: "Empresas",
    groupPieces: "Peças",
    paletteHint: "↑↓ mover · Enter abrir · Esc fechar",
    shortcutsHint: "Atalhos: / buscar · N novo · J/K próxima/anterior · Esc fechar",
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

    navSettings: "Ajustes",
    navAdmin: "Admin",
    signOut: "Cerrar sesión",
    collapseSidebar: "Contraer menú",
    expandSidebar: "Expandir menú",
    online: "En línea",
    offline: "Sin conexión",
    activeVisit: "Visita en curso",
    activeVisitAt: "Visita en curso en {lead}",
    openVisit: "Abrir visita",
    searchEverything: "Buscar",
    palettePlaceholder: "Buscar empresas, piezas o pantallas…",
    paletteEmpty: "No hay resultados.",
    groupPages: "Pantallas",
    groupCompanies: "Empresas",
    groupPieces: "Piezas",
    paletteHint: "↑↓ mover · Enter abrir · Esc cerrar",
    shortcutsHint: "Atajos: / buscar · N nuevo · J/K siguiente/anterior · Esc cerrar",
  },
};
