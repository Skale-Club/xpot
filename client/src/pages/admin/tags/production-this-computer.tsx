import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, Loader2, Nfc, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { thisComputerMessages } from "@/i18n/messages/thisComputer";
import { sendJson } from "./api";

// "This computer" on the Printing tab: any computer can make print files, so the page asks this one what it has. A page
// cannot see what is installed: Xpot Desktop (print-pipeline/desktop.py) answers on 127.0.0.1, and only to Xpot's pages.

const DESKTOP = "http://127.0.0.1:47631";
const SETUP_FILE = "/desktop/XpotDesktopSetup.cmd";

type ItemId = "connection" | "pipeline" | "packages" | "studio" | "fonts";
interface DesktopItem { id: ItemId; state: "ok" | "missing" | "working" | "failed"; detail: string | null }
interface DesktopStatus { supported: boolean; computerName: string; items: DesktopItem[]; ready: boolean; building: boolean; readers: string[] }

async function askDesktop(path: string, body?: unknown): Promise<DesktopStatus> {
  const res = await fetch(`${DESKTOP}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `Xpot Desktop answered ${res.status}`);
  return res.json() as Promise<DesktopStatus>;
}

/** Windows for now: the print files have only been checked there. */
function isWindows(): boolean {
  return typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
}

export function ThisComputer() {
  const t = useT(thisComputerMessages);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["xpot-desktop", "status"],
    queryFn: () => askDesktop("/status"),
    retry: false,
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
  const [connectError, setConnectError] = useState<string | null>(null);
  const asked = useRef(false);

  // Being signed in is enough: the page connects the computer by itself, no code to copy.
  const notConnected = data?.items.find((item) => item.id === "connection")?.state === "missing";
  const connect = async (computerName: string) => {
    setConnectError(null);
    try {
      const { pairingCode } = await sendJson<{ pairingCode: string }>("POST", "/api/xpot/admin/tag-provisioners", { deviceName: computerName });
      await askDesktop("/connect", { code: pairingCode });
      await refetch();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    if (!notConnected || !data || asked.current) return;
    asked.current = true;
    void connect(data.computerName);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when Xpot Desktop first says it is not connected
  }, [notConnected, data?.computerName]);

  const install = async (id: ItemId) => {
    await askDesktop(`/install/${id}`, {}).catch(() => undefined);
    await refetch();
  };

  if (isLoading) return null;
  const frame = "hidden space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 md:block";
  if (!isWindows()) return <p className="hidden text-xs text-white/50 md:block" data-testid="this-computer-other-system">{t("otherSystem")}</p>;

  if (!data) {
    return (
      <section className={frame} data-testid="this-computer-setup">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <h3 className="text-sm font-semibold text-white">{t("setupTitle")}</h3>
            <p className="mt-0.5 text-xs text-white/55">{t("setupHint")}</p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <a href={SETUP_FILE} download data-testid="this-computer-download"><Download />{t("setupDownload")}</a>
          </Button>
        </div>
      </section>
    );
  }

  const readers = data.readers.length ? (
    <p className="flex items-center gap-2 text-xs text-white/60" data-testid="this-computer-reader"><Nfc className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />{t("readerOn", { name: data.readers[0] })}</p>
  ) : null;

  if (data.ready) {
    return (
      <div className="hidden space-y-1 md:block" data-testid="this-computer-ready">
        <p className="flex items-center gap-2 text-xs text-white/60"><Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />{t("ready", { name: data.computerName })}</p>
        {readers}
      </div>
    );
  }

  return (
    <section className={frame} data-testid="this-computer-checklist">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("checklistTitle", { name: data.computerName })}</h3>
        <p className="mt-0.5 text-xs text-white/55">{t("checklistHint")}</p>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {data.items.map((item, index) => {
          // One at a time, in order: each step needs the one before it.
          const blocked = data.items.slice(0, index).some((before) => before.state !== "ok");
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`this-computer-item-${item.id}`} data-state={item.state}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm text-white">
                  {item.state === "ok" ? <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> : item.state === "working" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/50" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" aria-hidden="true" />}
                  {t(`item_${item.id}`)}
                </span>
                {item.id === "studio" && item.state !== "ok" ? <span className="mt-0.5 block pl-6 text-xs text-white/45">{t("studioHint")}</span> : null}
                {item.state === "failed" && item.detail ? <span className="mt-0.5 block pl-6 text-xs text-red-200/80">{item.detail}</span> : null}
                {item.id === "connection" && connectError ? <span className="mt-0.5 block pl-6 text-xs text-red-200/80">{connectError}</span> : null}
              </span>
              {item.state === "ok" || item.state === "working" || blocked ? null : item.id === "connection" ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => void connect(data.computerName)} data-testid="this-computer-connect"><RefreshCw />{t("tryAgain")}</Button>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => void install(item.id)} data-testid={`this-computer-install-${item.id}`}>
                  {item.state === "failed" ? <RefreshCw /> : <Download />}
                  {item.state === "failed" ? t("tryAgain") : t("install")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {readers}
    </section>
  );
}
