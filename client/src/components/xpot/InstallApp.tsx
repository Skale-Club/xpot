import { useState, type ReactNode } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstallApp } from "@/hooks/use-install-app";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";

// "Install app", offered where the rep goes looking (sidebar footer, Settings)
// and nowhere else: no banner, no pop-up on load. Renders nothing when the app
// is already installed or the browser can't install it.

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-white/75">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Browsers with no install prompt (iPhone, Safari on Mac) get the steps instead. */
function InstructionsDialog({ mode, open, onOpenChange }: { mode: "ios" | "safari-mac"; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(shellMessages);
  const [before, after] = t("installIosStep1").split("{icon}");
  const steps =
    mode === "ios"
      ? [
          <>
            {before}
            <Share className="mx-0.5 inline h-4 w-4 -translate-y-0.5 text-blue-400" aria-hidden="true" />
            {after}
          </>,
          <span className="inline-flex items-center gap-1.5">
            {t("installIosStep2")}
            <SquarePlus className="inline h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
          </span>,
          t("installIosStep3"),
        ]
      : [t("installMacStep1"), t("installMacStep2")];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-white/10 bg-[#0b1020] text-white" data-testid="install-instructions">
        <DialogHeader>
          <DialogTitle>{mode === "ios" ? t("installIosTitle") : t("installMacTitle")}</DialogTitle>
          <DialogDescription className="text-white/45">{t("installAppHint")}</DialogDescription>
        </DialogHeader>
        <Steps steps={steps} />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
        >
          {t("installDone")}
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** What the install trigger does (native prompt, or the steps dialog), or null when there is nothing to offer. */
function useInstallAction() {
  const { mode, install } = useInstallApp();
  const [open, setOpen] = useState(false);
  if (mode === "hidden") return null;
  const onClick = () => {
    if (mode === "prompt") void install();
    else setOpen(true);
  };
  const dialog = mode === "prompt" ? null : <InstructionsDialog mode={mode} open={open} onOpenChange={setOpen} />;
  return { onClick, dialog };
}

/** Sidebar footer item, styled like its neighbours. */
export function InstallAppSidebarItem({ collapsed }: { collapsed: boolean }) {
  const t = useT(shellMessages);
  const action = useInstallAction();
  if (!action) return null;
  return (
    <>
      <button
        type="button"
        onClick={action.onClick}
        title={collapsed ? t("installApp") : undefined}
        className={`flex h-10 w-full items-center gap-3 rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/85 ${
          collapsed ? "justify-center px-0" : "px-3"
        }`}
        data-testid="sidebar-install-app"
      >
        <Download className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{t("installApp")}</span>}
      </button>
      {action.dialog}
    </>
  );
}

/** A row for Settings: what installing gets you, and the button. */
export function InstallAppRow({ className = "" }: { className?: string }) {
  const t = useT(shellMessages);
  const action = useInstallAction();
  if (!action) return null;
  return (
    <>
      <div className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 ${className}`} data-testid="settings-install-app">
        <Download className="h-4 w-4 shrink-0 text-white/50" />
        <p className="min-w-0 flex-1 text-xs text-white/50">{t("installAppHint")}</p>
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.1]"
        >
          {t("installApp")}
        </button>
      </div>
      {action.dialog}
    </>
  );
}
