import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Camera, LogOut, Settings } from "lucide-react";
import type { XpotModule } from "@shared/modules";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { signOut } from "@/lib/signOut";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { dashboardMessages } from "@/i18n/messages/dashboard";
import { shellMessages } from "@/i18n/messages/shell";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminModeButton } from "./AdminMode";

// The person at the top of every phone screen, in both modules: their photo
// (tap to change it), the greeting, the date, and the buttons that belong to
// the whole app rather than one module: admin mode, Settings and sign out.
// The Visits/Tags switch sits right below it. On desktop the sidebar has the
// buttons, so the dashboard shows this without them (`actions={false}`).

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning" as const;
  if (h < 18) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const ICON_BUTTON =
  "flex h-10 w-10 items-center justify-center rounded-[18px] border border-white/5 bg-white/[0.03] text-white/40 transition-all hover:bg-white/10 hover:text-white active:scale-95 touch-manipulation";

export function ShellHeader({ module, actions = true }: { module: XpotModule; actions?: boolean }) {
  const t = useT(dashboardMessages);
  const ts = useT(shellMessages);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const online = useOnline();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });

  const name = me
    ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email || ""
    : "";
  const firstName = name.split(" ")[0] ?? "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const avatarUrl = me?.rep.avatarUrl;

  const avatarMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/me/avatar", { imageData });
      return res.json() as Promise<{ avatarUrl: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: t("photoUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: t("uploadFailed"), description: err.message, variant: "destructive" });
    },
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => avatarMutation.mutate(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3" data-testid="shell-header">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={avatarMutation.isPending}
          className="group relative shrink-0 transition-transform active:scale-95 touch-manipulation"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              style={{ boxShadow: "0 8px 24px rgba(59,130,246,0.25)" }}
              className="h-[62px] w-[62px] rounded-[22px] border border-white/10 object-cover"
            />
          ) : (
            <div
              className="flex h-[62px] w-[62px] items-center justify-center rounded-[22px] text-[22px] font-bold tracking-wide text-white"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(59,130,246,0.25)" }}
            >
              {avatarMutation.isPending ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                initials
              )}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white drop-shadow-lg" />
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-[#080d1a] ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/80">{t(greetingKey())}</div>
          <div className="mb-1.5 truncate text-[26px] font-extrabold leading-none tracking-tight text-white">{firstName} 👋</div>
          <div className="truncate text-xs font-medium text-white/40">
            {new Date().toLocaleDateString(t.locale, { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">
          <AdminModeButton module={module} />
          <button type="button" onClick={() => navigate("/settings")} title={ts("navSettings")} aria-label={ts("navSettings")} className={ICON_BUTTON} data-testid="shell-settings">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => void signOut(navigate)}
            title={ts("signOut")}
            aria-label={ts("signOut")}
            className={`${ICON_BUTTON} hover:bg-red-500/10 hover:text-red-400`}
            data-testid="shell-sign-out"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
    </div>
  );
}
