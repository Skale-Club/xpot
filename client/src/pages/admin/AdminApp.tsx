import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/ui/loader";
import { ShieldAlert, ArrowLeft, LayoutDashboard, Users, Plug, Webhook, Palette, Boxes } from "lucide-react";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminOverview } from "./AdminOverview";
import { AdminReps } from "./AdminReps";
import { AdminIntegrations } from "./AdminIntegrations";
import { AdminXphere } from "./AdminXphere";
import { AdminBranding } from "./AdminBranding";
import { AdminProducts } from "./AdminProducts";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Boxes },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "xphere", label: "Xphere", icon: Webhook },
  { id: "reps", label: "Reps", icon: Users },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminApp({ section }: { section: string }) {
  const [, setLocation] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });

  useEffect(() => {
    document.title = "Xpot | Admin";
  }, []);

  const me = meQuery.data;
  const active: SectionId = (SECTIONS.find((s) => s.id === section)?.id ?? "overview") as SectionId;

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060912]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  // Gate: admins and managers only.
  const allowed = !!me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role));
  if (!me || !allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060912] px-6 text-center text-white">
        <ShieldAlert className="h-10 w-10 text-red-400" />
        <div>
          <p className="text-lg font-semibold">Access restricted</p>
          <p className="mt-1 text-sm text-white/50">
            {me ? "You don't have admin permission." : "Sign in to continue."}
          </p>
        </div>
        <button
          onClick={() => setLocation(me ? "/dashboard" : "/")}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          {me ? "Back to app" : "Go to sign in"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/dashboard")}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10"
              title="Back to app"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Xpot Admin</h1>
              <p className="text-xs text-white/40">{me.user.email}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => setLocation(`/admin/${id}`)}
                className={`relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-blue-500/20 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <main>
          {active === "overview" && <AdminOverview />}
          {active === "products" && <AdminProducts />}
          {active === "integrations" && <AdminIntegrations />}
          {active === "branding" && <AdminBranding />}
          {active === "xphere" && <AdminXphere />}
          {active === "reps" && <AdminReps />}
        </main>
      </div>
    </div>
  );
}
