import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Download, Loader2, Nfc, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { thisComputerMessages } from "@/i18n/messages/thisComputer";
import { sendJson } from "./api";
import { readPreview, writePreview } from "@/lib/xpotDesktopPreview";
import { askDesktop, isWindows, useXpotDesktopStatus, type ItemId } from "@/lib/xpotDesktop";

export { isWindows, useXpotDesktopStatus };

// "This computer": whether the computer in front of the person generates print files. A page cannot see what is
// installed: Xpot Desktop (print-pipeline/desktop.py) answers on 127.0.0.1, and only to Xpot's pages. The whole setup
// (download, install what is missing, pairing with the account) happens in one place, ThisComputerSteps: inside Make's
// locked panel and on the Devices screen alike, with no page to go to in between.

/** The Windows installer (print-pipeline/setup/XpotDesktop.iss, `npm run desktop:installer`), served from client/public. */
const SETUP_FILE = "/desktop/XpotDesktopSetup.exe";

/**
 * The setup of this computer, step by step, in place: 1. download Xpot Desktop (the page notices by itself when it
 * runs), 2. install what is missing with one button (each item in turn; the account connects by itself, being signed
 * in is enough), 3. ready. Once ready it shows a short line, or nothing with `readyLine={false}`.
 */
export function ThisComputerSteps({ readyLine = true }: { readyLine?: boolean }) {
  const t = useT(thisComputerMessages);
  const { data, isLoading, refetch } = useXpotDesktopStatus(4000);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [installingAll, setInstallingAll] = useState(false);
  const asked = useRef(false);

  const connect = async (computerName: string) => {
    setConnectError(null);
    try {
      // The stage switcher's pretend computer connects without asking the server for a real pairing code.
      const pretend = readPreview().computer !== "real";
      const { pairingCode } = pretend ? { pairingCode: "preview" } : await sendJson<{ pairingCode: string }>("POST", "/api/xpot/admin/tag-provisioners", { deviceName: computerName });
      await askDesktop("/connect", { code: pairingCode });
      await refetch();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  };
  const notConnected = data?.items.find((item) => item.id === "connection")?.state === "missing";
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

  // "Install everything": one click, then each missing item in turn as the one before finishes; a failure stops it.
  const items = data?.items ?? [];
  const next = items.find((item) => item.id !== "connection" && item.state !== "ok");
  const busy = items.some((item) => item.state === "working");
  const failed = items.some((item) => item.state === "failed");
  useEffect(() => {
    if (!installingAll) return;
    if (failed || !next) { setInstallingAll(false); return; }
    if (!busy && !notConnected && next.state === "missing") void install(next.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to Xpot Desktop's answers
  }, [installingAll, next?.id, next?.state, busy, failed, notConnected]);

  if (isLoading) return null;
  if (!isWindows()) return <p className="text-xs text-white/55" data-testid="this-computer-other-system">{t("otherSystem")}</p>;

  const step = (index: number, title: string, state: "done" | "now" | "later", body?: ReactNode) => (
    <li className="flex gap-3" data-step={index} data-state={state}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${state === "done" ? "bg-emerald-400/15 text-emerald-300" : state === "now" ? "bg-white text-black" : "bg-white/[0.06] text-white/40"}`}>
        {state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index}
      </span>
      <div className={`min-w-0 flex-1 ${state === "later" ? "text-white/35" : ""}`}>
        <p className={`text-sm font-medium ${state === "done" ? "text-white/45" : state === "now" ? "text-white" : ""}`}>{title}</p>
        {state === "now" && body ? <div className="mt-2 space-y-2">{body}</div> : null}
      </div>
    </li>
  );

  if (data?.ready) {
    return readyLine ? (
      <div className="space-y-1" data-testid="this-computer-ready">
        <p className="flex items-center gap-2 text-xs text-white/60"><Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />{t("ready", { name: data.computerName })}</p>
        {data.readers.length ? <p className="flex items-center gap-2 text-xs text-white/60" data-testid="this-computer-reader"><Nfc className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />{t("readerOn", { name: data.readers[0] })}</p> : null}
      </div>
    ) : null;
  }

  const download = (
    <>
      <p className="text-xs text-white/55">{t("setupHint")}</p>
      <Button asChild variant="brand" accent="tags" size="sm">
        <a
          href={SETUP_FILE}
          download
          // The stage switcher's pretend computer "installs" Xpot Desktop instead of downloading it.
          onClick={(event) => { if (readPreview().computer === "absent") { event.preventDefault(); writePreview({ computer: "installed" }); void refetch(); } }}
          data-testid="this-computer-download"
        ><Download />{t("setupDownload")}</a>
      </Button>
      <p className="flex items-center gap-2 text-xs text-white/40"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{t("waitingForDesktop")}</p>
    </>
  );

  const checklist = data ? (
    <>
      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-black/10 px-3">
        {data.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`this-computer-item-${item.id}`} data-state={item.state}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm text-white/85">
                {item.state === "ok" ? <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> : item.state === "working" || (item.id === "connection" && item.state === "missing" && !connectError) ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/50" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" aria-hidden="true" />}
                {t(`item_${item.id}`)}
              </span>
              {item.id === "studio" && item.state !== "ok" ? <span className="mt-0.5 block pl-6 text-xs text-white/45">{t("studioHint")}</span> : null}
              {item.state === "failed" && item.detail ? <span className="mt-0.5 block pl-6 text-xs text-red-200/80">{item.detail}</span> : null}
              {item.id === "connection" && connectError ? <span className="mt-0.5 block pl-6 text-xs text-red-200/80">{connectError}</span> : null}
            </span>
            {item.id === "connection" && connectError ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void connect(data.computerName)} data-testid="this-computer-connect"><RefreshCw />{t("tryAgain")}</Button>
            ) : item.state === "failed" ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => { setInstallingAll(true); void install(item.id); }} data-testid={`this-computer-retry-${item.id}`}><RefreshCw />{t("tryAgain")}</Button>
            ) : null}
          </li>
        ))}
      </ul>
      {data.autoSetup ? <p className="text-xs text-white/50" data-testid="this-computer-auto-setup">{t("autoSetupHint")}</p> : null}
      {next && !failed && !data.autoSetup ? (
        // Not the button's own loading state: it hides the label, and three dots do not say that it is installing.
        <Button type="button" variant="brand" accent="tags" size="sm" disabled={notConnected || installingAll || busy} onClick={() => setInstallingAll(true)} data-testid="this-computer-install-all">
          {installingAll || busy ? <Loader2 className="animate-spin" /> : <Download />}{installingAll || busy ? t("installingAll") : t("installAll")}
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <ol className="space-y-4" data-testid={data ? "this-computer-checklist" : "this-computer-setup"}>
      {step(1, t("stepDownload"), data ? "done" : "now", download)}
      {step(2, t("stepInstall"), data ? "now" : "later", checklist)}
      {step(3, t("stepReady"), "later")}
    </ol>
  );
}
