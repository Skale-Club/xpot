import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { TABLE_HEAD } from "@/components/xpot/surface";
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
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{t("csvReviewTitle")}</DialogTitle>
        </DialogHeader>

        {rows && rows.length === 0 ? (
          <p className="text-sm text-white/50">{t("csvEmpty")}</p>
        ) : (
          <>
            <p className="text-sm text-white/50">{t.plural("csvRows", rows?.length ?? 0)}</p>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/[0.07]">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className={`sticky top-0 bg-[#0d1322] ${TABLE_HEAD}`}>
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

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={importing}>
            {tc(rows && rows.length === 0 ? "close" : "cancel")}
          </Button>
          {rows && rows.length > 0 && (
            <Button type="button" variant="brand" onClick={onConfirm} loading={importing}>
              {t.plural("importCount", rows.length)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
