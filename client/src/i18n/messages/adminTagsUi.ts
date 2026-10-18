import type { Dictionary } from "../index";

// New words of the Tags admin screens after their move onto the shared UI kit
// (pages/admin/tags). The rest of their text is in manageTags*.ts.

const en = {
  journeyGroup: "{count} similar entries",
  journeyGroupShow: "Show all",
  journeyGroupHide: "Show less",
};

export const adminTagsUiMessages: Dictionary<typeof en> = {
  en,
  pt: {
    journeyGroup: "{count} registros parecidos",
    journeyGroupShow: "Mostrar todos",
    journeyGroupHide: "Mostrar menos",
  },
  es: {
    journeyGroup: "{count} registros similares",
    journeyGroupShow: "Mostrar todos",
    journeyGroupHide: "Mostrar menos",
  },
};
