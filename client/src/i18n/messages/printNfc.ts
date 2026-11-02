import type { Dictionary } from "../index";

// Which NFC goes inside a piece, asked whenever a print is created (production-nfc.tsx). Each one is a different file.

const en = {
  question: "Which NFC goes inside?",
  step: "NFC",
  field: "NFC inside",
  recommended: "Standard",
  name_sticker_round_25: "Round sticker, 1 inch",
  name_sticker_10x20: "Sticker, 10 x 20 mm",
  name_embedded_round: "Round tag, 25 mm",
  hint_sticker_round_25: "NTAG215. Stuck in the pocket at the pause, written after printing.",
  hint_sticker_10x20: "NTAG213. Stuck in the pocket at the pause, written after printing.",
  hint_embedded_round: "NTAG215. Written before printing and dropped in by the serial map.",
};

export const printNfcMessages: Dictionary<typeof en> = {
  en,
  pt: {
    question: "Qual NFC vai dentro?",
    step: "NFC",
    field: "NFC dentro",
    recommended: "Padrão",
    name_sticker_round_25: "Adesivo redondo, 1 polegada",
    name_sticker_10x20: "Adesivo, 10 x 20 mm",
    name_embedded_round: "Pastilha, 25 mm",
    hint_sticker_round_25: "NTAG215. Colado no bolso na pausa e gravado depois de imprimir.",
    hint_sticker_10x20: "NTAG213. Colado no bolso na pausa e gravado depois de imprimir.",
    hint_embedded_round: "NTAG215. Gravada antes de imprimir e colocada pelo mapa de séries.",
  },
  es: {
    question: "¿Qué NFC va dentro?",
    step: "NFC",
    field: "NFC dentro",
    recommended: "Estándar",
    name_sticker_round_25: "Adhesivo redondo, 1 pulgada",
    name_sticker_10x20: "Adhesivo, 10 x 20 mm",
    name_embedded_round: "Pastilla, 25 mm",
    hint_sticker_round_25: "NTAG215. Se pega en el bolsillo en la pausa y se graba después de imprimir.",
    hint_sticker_10x20: "NTAG213. Se pega en el bolsillo en la pausa y se graba después de imprimir.",
    hint_embedded_round: "NTAG215. Se graba antes de imprimir y se coloca según el mapa de series.",
  },
};
