import type { Dictionary } from "../index";

// The search that starts a visit from the top of the Visits dashboard
// (client/src/pages/xpot/components/QuickCheckIn.tsx). The result list itself
// uses checkinMessages, shared with the check-in screen.

const en = {
  title: "Start a visit",
  subtitle: "Find a saved company or any business on Google",
  placeholder: "Search a company or a place to check in...",
  locLocating: "Locating…",
  locPrecise: "Precise location · ±{accuracy}",
  locApprox: "Approximate location · ±{accuracy}",
  locOff: "Turn on location",
  locBlocked: "Location blocked",
  locApproxHint: "Computers locate by Wi-Fi, so this can be off. If you land outside the company's radius, you can give a reason at check-in.",
  locBlockedHint: "Allow location for this site in your browser settings to validate visits.",
  hintFocus: "to search",
  hintNavigate: "to move",
  hintOpen: "to open the check-in",
  opening: "Opening check-in…",
};

export const quickCheckInMessages: Dictionary<typeof en> = {
  en,
  pt: {
    title: "Iniciar visita",
    subtitle: "Encontre uma empresa salva ou qualquer empresa no Google",
    placeholder: "Buscar empresa ou lugar para check-in...",
    locLocating: "Localizando…",
    locPrecise: "Localização precisa · ±{accuracy}",
    locApprox: "Localização aproximada · ±{accuracy}",
    locOff: "Ativar localização",
    locBlocked: "Localização bloqueada",
    locApproxHint: "Computadores se localizam pelo Wi-Fi, então pode haver erro. Se cair fora do raio da empresa, você pode informar um motivo no check-in.",
    locBlockedHint: "Permita a localização deste site nas configurações do navegador para validar as visitas.",
    hintFocus: "para buscar",
    hintNavigate: "para navegar",
    hintOpen: "para abrir o check-in",
    opening: "Abrindo check-in…",
  },
  es: {
    title: "Iniciar visita",
    subtitle: "Encuentra una empresa guardada o cualquier negocio en Google",
    placeholder: "Buscar empresa o lugar para el check-in...",
    locLocating: "Ubicando…",
    locPrecise: "Ubicación precisa · ±{accuracy}",
    locApprox: "Ubicación aproximada · ±{accuracy}",
    locOff: "Activar ubicación",
    locBlocked: "Ubicación bloqueada",
    locApproxHint: "Las computadoras se ubican por Wi-Fi, así que puede haber error. Si quedas fuera del radio de la empresa, puedes dar un motivo en el check-in.",
    locBlockedHint: "Permite la ubicación de este sitio en la configuración del navegador para validar las visitas.",
    hintFocus: "para buscar",
    hintNavigate: "para moverte",
    hintOpen: "para abrir el check-in",
    opening: "Abriendo check-in…",
  },
};
