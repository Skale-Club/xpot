import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { Spinner } from "./ui";

/**
 * A computer cannot write NFC chips: this shows a QR the rep scans with the
 * phone to open the same screen there.
 */
export function ContinueOnPhone({ url }: { url: string }) {
  const t = useT(tagsMessages);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Loaded on demand: only desktop users ever need it.
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0b1020", light: "#ffffff" } }).then((data) => {
        if (alive) setSrc(data);
      }),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="mt-5 flex items-center gap-4 rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-4" data-testid="continue-on-phone">
      <div className="flex h-[132px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        {src ? <img src={src} alt="" className="h-full w-full" /> : <Spinner className="h-6 w-6 text-slate-400" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Smartphone className="h-4 w-4 text-blue-300" />
          {t("continueOnPhone")}
        </div>
        <p className="mt-1.5 text-sm text-white/60">{t("continueOnPhoneHint")}</p>
      </div>
    </div>
  );
}
