import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentKindOf, contentSummary } from "@shared/chipContent";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { BottomSheet, Spinner } from "./ui";

/**
 * A direct piece's content as a QR code: a link, mailto:, tel: or the vCard
 * text itself, which phone cameras open as a site, an email, a call or a new
 * contact. Downloadable as a PNG for printing.
 */
export function ContentQr({ open, value, onClose }: { open: boolean; value: string; onClose: () => void }) {
  const t = useT(tagsMessages);
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
      <p className="text-sm text-white/50">{t("qrHint")}</p>
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
        <Button asChild variant="secondary" size="lg" className="mt-4 w-full">
          <a href={src} download={`${name}.png`}>
            <Download className="!size-5" />
            {t("downloadQr")}
          </a>
        </Button>
      )}
    </BottomSheet>
  );
}
