import { useQuery } from "@tanstack/react-query";
import { isSuperAdmin } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import type { XpotMeResponse } from "@/pages/xpot/types";

// What only the global admin (users.is_admin, Skale Club) sees carries this tag,
// so it is never mistaken for something a manager or reseller also has.

/** Whether the signed-in person is the global admin. */
export function useIsSuperAdmin(): boolean {
  const { data } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  return isSuperAdmin(data);
}

/** Small amber "Admin" pill; `dot` is the collapsed-sidebar form. */
export function AdminBadge({ dot = false, className = "" }: { dot?: boolean; className?: string }) {
  const t = useT(shellMessages);
  if (dot) {
    return <span className={`h-1.5 w-1.5 rounded-full bg-amber-400 ${className}`} title={t("superAdminHint")} aria-label={t("superAdminHint")} />;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-amber-300 ${className}`}
      title={t("superAdminHint")}
      data-testid="admin-badge"
    >
      {t("superAdminTag")}
    </span>
  );
}
