import type { Dictionary } from "../index";

// "What's missing" on the Production board (client/src/pages/admin/tags/production-board.tsx): parts below their reorder point.

const en = {
  title: "What's missing",
  intro: "Pieces and bases below their reorder point. Open one to print more.",
  onHand: "{count} on hand",
  reorderAt: "reorder at {reorder}",
};

export const productionMissingMessages: Dictionary<typeof en> = {
  en,
  pt: {
    title: "O que falta",
    intro: "Peças e bases abaixo do ponto de reposição. Abra uma para imprimir mais.",
    onHand: "{count} em estoque",
    reorderAt: "repor em {reorder}",
  },
  es: {
    title: "Lo que falta",
    intro: "Piezas y bases por debajo del punto de reposición. Abre una para imprimir más.",
    onHand: "{count} en stock",
    reorderAt: "reponer en {reorder}",
  },
};
