import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AccessNotice } from "@/components/AccessNotice";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { queryClient } from "@/lib/queryClient";
import { signOut } from "@/lib/signOut";
import { sessionProblem } from "@/lib/pwa";
import { signInPath } from "@/lib/xpot";

/**
 * What a module shows before /api/xpot/me answers, and instead of the module
 * when it does not: a spinner while it loads, then by what went wrong. No
 * session (or an expired one) opens the sign-in dialog and comes back to this
 * page afterwards; a sign-up still under review (or an access turned off) says
 * so; no signal says so and offers to try again. Every shell used its own copy.
 * It is the only thing rendered, so nothing under it can start another request
 * for /api/xpot/me while that one is failing.
 */
export function SessionGate({ error }: { error?: unknown }) {
  const t = useT(commonMessages);
  const ts = useT(shellMessages);
  const [, navigate] = useLocation();
  const { data: config } = useQuery<{ supportWhatsapp: string | null }>({ queryKey: ["/api/auth/phone/config"], staleTime: Infinity, enabled: !!error });
  const problem = error ? sessionProblem(error) : null;

  useEffect(() => {
    if (problem !== "signed-out") return;
    navigate(signInPath(`${window.location.pathname}${window.location.search}`), { replace: true });
  }, [problem, navigate]);

  const whatsapp = config?.supportWhatsapp ? `https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}` : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#060912] px-6 text-white" data-testid="session-gate">
      <div className="w-full max-w-sm">
        {problem === "pending" || problem === "blocked" ? (
          <AccessNotice
            kind={problem}
            whatsappHref={whatsapp}
            action={
              <button type="button" onClick={() => void signOut(navigate)} className="min-h-10 text-sm text-white/50 hover:text-white" data-testid="session-gate-sign-out">
                {ts("signOut")}
              </button>
            }
          />
        ) : problem === "unreachable" ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-white/60">{t("sessionFailed")}</p>
            <Button variant="secondary" onClick={() => void queryClient.refetchQueries({ queryKey: ["/api/xpot/me"] })} data-testid="session-gate-retry">
              {t("retry")}
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          </div>
        )}
      </div>
    </div>
  );
}
