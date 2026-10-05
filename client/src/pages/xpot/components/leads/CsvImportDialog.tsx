import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { BRAND_GRADIENT } from "@/components/xpot/surface";
import type { CsvLeadRow } from "../../csvLeads";

export type { CsvLeadRow };

const PREVIEW_LIMIT = 50;

/** What the CSV holds, before anything is written. */
export function CsvImportDialog({
  rows,
  onCancel,
  onConfirm,
  importing,
}: {
  /** null = closed; [] = a file with no usable rows. */
  rows: CsvLeadRow[] | null;
  onCancel: () => void;
  onConfirm: () => void;
  importing: boolean;
}) {
  const t = useT(leadsMessages);
  const tc = useT(commonMessages);
  const open = rows !== null;
  const shown = rows?.slice(0, PREVIEW_LIMIT) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !importing) onCancel(); }}>
      <DialogContent
        className="max-w-[calc(100vw-1.5rem)] rounded-2xl border-0 p-6 sm:max-w-3xl"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{t("csvReviewTitle")}</DialogTitle>
        </DialogHeader>

        {rows && rows.length === 0 ? (
          <p className="text-sm text-white/50">{t("csvEmpty")}</p>
        ) : (
          <>
            <p className="text-sm text-white/50">{t.plural("csvRows", rows?.length ?? 0)}</p>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/[0.07]">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="sticky top-0 text-[10px] uppercase tracking-widest text-white/35" style={{ background: "#11151f" }}>
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t("colName")}</th>
                    <th className="px-3 py-2 font-semibold">{t("colPhone")}</th>
                    <th className="px-3 py-2 font-semibold">{t("fieldEmail")}</th>
                    <th className="px-3 py-2 font-semibold">{t("fieldCity")}</th>
                    <th className="px-3 py-2 font-semibold">{t("colIndustry")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-white/70">
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-white">{r.name}</td>
                      <td className="px-3 py-2">{r.phone || "—"}</td>
                      <td className="px-3 py-2">{r.email || "—"}</td>
                      <td className="px-3 py-2">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-3 py-2">{r.industry || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows && rows.length > PREVIEW_LIMIT && (
              <p className="text-xs text-white/35">{t("csvMore", { count: rows.length - PREVIEW_LIMIT })}</p>
            )}
          </>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={importing}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white/60 hover:text-white disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            {tc(rows && rows.length === 0 ? "close" : "cancel")}
          </button>
          {rows && rows.length > 0 && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={importing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND_GRADIENT }}
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.plural("importCount", rows.length)}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
