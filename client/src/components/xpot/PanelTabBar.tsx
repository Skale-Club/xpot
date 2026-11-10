import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Ellipsis } from "lucide-react";
import { BottomSheet } from "@/pages/tags/ui";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { MobileTabBar } from "./MobileTabBar";
import { panelPhoneTabs, type NavGroup } from "./moduleNav";
import { PANEL_ICON, usePanelSwitch, type Accent } from "./panelSwitch";
import type { Panel } from "./panels";

// The panel's bottom bar on a phone, in the panel's colour: its first screens;
// "More" opens the rest of the menu, grouped as in the sidebar, and the way to
// the person's other panels (the phone has no sidebar).

const MORE = "__more";

export function PanelTabBar({ groups, panel, accent }: { groups: NavGroup[]; panel: Panel; accent: Accent }) {
  const t = useT(workspacesMessages);
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { tabs, more } = panelPhoneTabs(groups, panel);
  const switcher = usePanelSwitch();
  const others = switcher.panels.filter((other) => other !== switcher.current);
  const lit = tabs.find((item) => item.match(location));
  const items = [
    ...tabs.map((item) => ({ id: item.href, href: item.href, label: item.label, icon: item.icon, testId: `panel-nav-${item.href.replace(/\W+/g, "-").replace(/^-|-$/g, "")}` })),
    ...(more.length || others.length ? [{ id: MORE, label: t("moreTab"), icon: Ellipsis, testId: "panel-nav-more" }] : []),
  ];
  return (
    <>
      <MobileTabBar
        module="tags"
        accent={accent}
        wrapLabels
        tabs={items}
        activeId={open ? MORE : lit?.href ?? (more.length || others.length ? MORE : "")}
        onSelect={(id) => (id === MORE ? setOpen(true) : navigateGuarded(id, navigate))}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("moreTab")}>
        <div className="space-y-4" data-testid="panel-more">
          {others.length > 0 ? (
            <div className="space-y-1" data-testid="panel-more-panels">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">{t("panelsHeading")}</p>
              {others.map((other) => {
                const Icon = PANEL_ICON[other];
                return (
                  <button
                    key={other}
                    type="button"
                    onClick={() => { setOpen(false); switcher.go(other); }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-white/70 transition-colors active:bg-white/[0.06]"
                    data-testid={`panel-more-${other}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{switcher.label(other)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {more.map((group, index) => (
            <div key={group.label || index} className="space-y-1">
              {group.label ? <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">{group.label}</p> : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.match(location);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${active ? "bg-amber-400/10 text-white" : "text-white/70 active:bg-white/[0.06]"}`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-amber-200" : ""}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
