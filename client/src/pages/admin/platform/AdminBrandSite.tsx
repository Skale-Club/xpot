import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { FileText, Palette, Smartphone } from "lucide-react";
import { Tabs } from "@/components/xpot/Tabs";
import { useT } from "@/i18n";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { BrandIdentity, InstalledApp } from "../AdminBranding";
import { AdminLandingContent } from "../AdminLandingContent";
import { BRAND_SITE_TABS, brandSiteTabFrom, brandSiteTabHref, type BrandSiteTab } from "./brandSiteUi";

const TAB_ICONS = { identity: Palette, app: Smartphone, landing: FileText };
const TAB_KEYS = { identity: "brandTabIdentity", app: "brandTabApp", landing: "brandTabLanding" } as const;

/**
 * Admin › Brand & public site: what the brand looks like everywhere. Identity
 * (icon and logo), the installed app (name and colours) and the public Landing
 * page, one tab each. /admin/branding and /admin/landing both open it.
 */
export function AdminBrandSite() {
  const tp = useT(platformAdminMessages);
  const [location, navigate] = useLocation();
  const search = useSearch();
  const tab = brandSiteTabFrom(location, search);
  // The Landing editor keeps its unpublished drafts while another tab is open;
  // its own guard still asks before the page is left.
  const [landingOpened, setLandingOpened] = useState(tab === "landing");
  useEffect(() => {
    if (tab === "landing") setLandingOpened(true);
  }, [tab]);

  return (
    <div className="space-y-4" data-testid="brand-site">
      <Tabs<BrandSiteTab>
        tabs={BRAND_SITE_TABS.map((id) => ({ id, label: tp(TAB_KEYS[id]), icon: TAB_ICONS[id], testId: `brand-site-tab-${id}` }))}
        value={tab}
        onChange={(id) => navigate(brandSiteTabHref(id))}
        ariaLabel={tp("brandSiteTitle")}
        idPrefix="brand-site"
        accent="account"
      />
      {tab === "identity" && <BrandIdentity />}
      {tab === "app" && <InstalledApp />}
      {landingOpened && (
        <div hidden={tab !== "landing"}>
          <AdminLandingContent />
        </div>
      )}
    </div>
  );
}
