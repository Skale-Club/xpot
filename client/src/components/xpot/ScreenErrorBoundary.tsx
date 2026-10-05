import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

function CrashCard() {
  const t = useT(commonMessages);
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-6 text-center" role="alert" data-testid="screen-crashed">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-300" />
      <p className="mt-3 text-base font-semibold text-white">{t("screenCrashed")}</p>
      <p className="mt-1 text-sm text-white/55">{t("screenCrashedHint")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
      >
        <RotateCw className="h-4 w-4" />
        {t("reload")}
      </button>
    </div>
  );
}

/**
 * Keeps one broken screen from blanking the whole app: React unmounts the entire
 * tree on an uncaught render error, sidebar and tab bar included. The shell wraps
 * each screen in this and passes the path as `resetKey`: after a crash, moving to
 * another path clears it. It is deliberately not a React `key`: keying by the path
 * would remount the whole screen on every in-screen navigation (/leads → /leads/12
 * opens a detail pane) and wipe its search, filters and scroll.
 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[screen crashed]", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <CrashCard /> : this.props.children;
  }
}
