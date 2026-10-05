import { useLocation } from "wouter";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/**
 * What a module shows before /api/xpot/me answers: a spinner, or a way back to
 * sign-in when the session could not load. Every shell used its own copy.
 */
export function SessionGate({ failed }: { failed: boolean }) {
  const t = useT(commonMessages);
  const [, navigate] = useLocation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060912] text-white">
      {failed ? (
        <>
          <p className="text-sm text-white/50">{t("sessionFailed")}</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            {t("goToSignIn")}
          </button>
        </>
      ) : (
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      )}
    </div>
  );
}
