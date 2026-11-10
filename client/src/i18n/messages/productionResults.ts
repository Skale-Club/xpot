import type { Dictionary } from "../index";

// The production numbers on Pieces results (client/src/pages/admin/tags/production-results.tsx).

const en = {
  title: "Production",
  period: "Period",
  days: "{days} days",
  printed: "Pieces printed",
  lost: "Pieces lost",
  rate: "Problem rate",
  activated: "Pieces activated",
  allTime: "All time",
  whyLost: "Why they were lost",
  failedPrints_one: "{count} whole print failed",
  failedPrints_other: "{count} whole prints failed",
};

export const productionResultsMessages: Dictionary<typeof en> = {
  en,
  pt: {
    title: "Produção",
    period: "Período",
    days: "{days} dias",
    printed: "Peças impressas",
    lost: "Peças perdidas",
    rate: "Taxa de problemas",
    activated: "Peças ativadas",
    allTime: "Desde o início",
    whyLost: "Por que foram perdidas",
    failedPrints_one: "{count} impressão inteira falhou",
    failedPrints_other: "{count} impressões inteiras falharam",
  },
  es: {
    title: "Producción",
    period: "Período",
    days: "{days} días",
    printed: "Piezas impresas",
    lost: "Piezas perdidas",
    rate: "Tasa de problemas",
    activated: "Piezas activadas",
    allTime: "Desde el inicio",
    whyLost: "Por qué se perdieron",
    failedPrints_one: "{count} impresión completa falló",
    failedPrints_other: "{count} impresiones completas fallaron",
  },
};
