import type { Dictionary } from "../index";

// The people chips on the stock list (client/src/pages/admin/tags/PiecesTab.tsx).

const en = {
  groupLabel: "Pieces by person",
  sold: "{count} sold",
};

export const piecesByPersonMessages: Dictionary<typeof en> = {
  en,
  pt: {
    groupLabel: "Peças por pessoa",
    sold: "{count} vendidas",
  },
  es: {
    groupLabel: "Piezas por persona",
    sold: "{count} vendidas",
  },
};
