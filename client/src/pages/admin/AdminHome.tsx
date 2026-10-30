import { Link } from "wouter";
import { ArrowRight, Building2, LayoutDashboard, Package, PackageOpen, Printer, Users } from "lucide-react";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { shellMessages } from "@/i18n/messages/shell";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";

export function AdminHome() {
  const t = useT(workspacesMessages);
  const s = useT(shellMessages);
  const superAdmin = useIsSuperAdmin();
  const actions = superAdmin ? [
    { href: "/admin/tags/production", title: s("manageProduction"), hint: t("productionHint"), icon: Printer },
    { href: "/admin/tags/pieces", title: s("managePieces"), hint: t("stockHint"), icon: Package },
    { href: "/admin/tags/kits", title: s("manageKits"), hint: t("distributionHint"), icon: PackageOpen },
  ] : [
    { href: "/admin/overview", title: s("manageTeam"), hint: t("teamIntro"), icon: LayoutDashboard },
    { href: "/admin/reps", title: s("orgPeople"), hint: t("teamIntro"), icon: Users },
    { href: "/organizations", title: s("navOrganizations"), hint: t("teamIntro"), icon: Building2 },
  ];
  return <div className="space-y-6" data-testid="management-home">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">{t(superAdmin ? "superAdmin" : "management")}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{t("startTitle")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">{t(superAdmin ? "superIntro" : "teamIntro")}</p></header>
    <div className="grid gap-3 md:grid-cols-3">{actions.map(({ href, title, hint, icon: Icon }, index) => <Link key={href} href={href} className={`group flex min-h-48 flex-col justify-between rounded-2xl border p-5 transition-colors ${index === 0 ? "border-violet-400/30 bg-violet-500/[0.06] hover:bg-violet-500/[0.1]" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"}`}>
      <Icon className={`h-7 w-7 ${index === 0 ? "text-violet-300" : "text-white/55"}`} aria-hidden="true" /><span><span className="flex items-center justify-between gap-2 text-base font-semibold text-white">{title}<ArrowRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-1" /></span><span className="mt-2 block text-sm leading-relaxed text-white/50">{hint}</span></span>
    </Link>)}</div>
  </div>;
}
