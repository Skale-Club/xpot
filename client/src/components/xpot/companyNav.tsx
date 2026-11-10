import { Link, useLocation } from "wouter";
import { Briefcase } from "lucide-react";
import { BottomSheet } from "@/pages/tags/ui";
import { useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { navIaMessages } from "@/i18n/messages/navIa";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { ownedOrganizationId, useViewerAccess } from "@/lib/adminMode";
import { panelGroups, type NavGroup } from "./moduleNav";
import { usePanelNames } from "./panelNames";
import type { Accent } from "./panelSwitch";

// An owner's team (docs/PANELS_EXECUTION_PLAN.md phase F4) is not a panel: it is the Company group that Visits and Tags
// list under their own screens. This is the group for whoever has it (nobody else does), and, for the phone, the sheet
// the Visits and Tags bars open it in.

/** The Company group of an owner, as a list of groups (one, or none: a seller who owns no organization has none). */
export function useCompanyGroups(): NavGroup[] {
  const shell = useT(shellMessages);
  const tags = useT(tagsMessages);
  const nav = useT(navIaMessages);
  const modules = useXpotModules();
  const { me, profile } = useViewerAccess();
  const { names } = usePanelNames();
  return profile === "owner" ? panelGroups(profile, "visits", modules, { shell, tags, nav }, names, ownedOrganizationId(me)) : [];
}

/** The phone bars' tab for the Company group: its id, its icon and its name (the group's own). */
export const COMPANY_TAB = { id: "company", icon: Briefcase, testId: "company-nav" } as const;

/** Whether a screen the Company group lists is open. */
export function companyOpen(groups: NavGroup[], path: string): boolean {
  return groups.some((group) => group.items.some((item) => item.match(path)));
}

/** The Company group's screens, in a sheet over the phone bar. */
export function CompanySheet({ open, onClose, groups, accent }: { open: boolean; onClose: () => void; groups: NavGroup[]; accent: Accent }) {
  const [location] = useLocation();
  return (
    <BottomSheet open={open} onClose={onClose} title={groups[0]?.label ?? ""}>
      <div className="space-y-1" data-testid="company-sheet">
        {groups.flatMap((group) => group.items).map((item) => {
          const Icon = item.icon;
          const active = item.match(location);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${active ? "bg-white/[0.08] text-white" : "text-white/70 active:bg-white/[0.06]"}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? accent.text : ""}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </BottomSheet>
  );
}
