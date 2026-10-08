import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { contentKindOf, contentSummary } from "@shared/chipContent";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { BottomSheet, SHEET_TITLE, Spinner } from "./ui";

/**
 * A direct piece's content as a QR code: a link, mailto:, tel: or the vCard
 * text itself, which phone cameras open as a site, an email, a call or a new
 * contact. Downloadable as a PNG for printing.
 */
export function ContentQr({ open, value, onClose }: { open: boolean; value: string; onClose: () => void }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !value) return;
    let alive = true;
    setSrc(null);
    setFailed(false);
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(value, { margin: 2, width: 720, errorCorrectionLevel: "M", color: { dark: "#0b1020", light: "#ffffff" } }))
      .then((data) => {
        if (alive) setSrc(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, value]);

  const name = (contentKindOf(value) === "url" ? "xpot-qr" : `xpot-${contentSummary(value)}`).replace(/[^\w.-]+/g, "-").slice(0, 60);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("contentQrTitle")}>
      <div className="flex items-center justify-between">
        <h2 className={SHEET_TITLE}>{t("contentQrTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={tc("close")} className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 active:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1 text-sm text-white/50">{t("qrHint")}</p>
      <div className="mx-auto mt-4 flex aspect-square w-full max-w-[320px] items-center justify-center overflow-hidden rounded-2xl bg-white" data-testid="content-qr">
        {src ? (
          <img src={src} alt="" className="h-full w-full" />
        ) : failed ? (
          <p className="px-4 text-center text-sm font-semibold text-slate-500">{t("qrImageFailed")}</p>
        ) : (
          <Spinner className="h-8 w-8 text-slate-400" />
        )}
      </div>
      {src && (
        <a
          href={src}
          download={`${name}.png`}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] text-base font-bold text-white active:bg-white/10"
        >
          <Download className="h-5 w-5" />
          {t("downloadQr")}
        </a>
      )}
    </BottomSheet>
  );
}
