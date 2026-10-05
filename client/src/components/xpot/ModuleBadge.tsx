import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

const TONE: Record<XpotModule, string> = {
  visits: "border-blue-400/30 bg-blue-400/10 text-blue-200",
  tags: "border-violet-400/30 bg-violet-400/10 text-violet-200",
};

/**
 * Names the other module when a screen shows its data (pieces on a Visits lead,
 * the Tags card on the Painel): the click that follows crosses into that module,
 * and the badge says so. Same colours as the module's accent (surface.ts).
 */
export function ModuleBadge({ module, className = "" }: { module: XpotModule; className?: string }) {
  const t = useT(commonMessages);
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${TONE[module]} ${className}`}>
      {module === "visits" ? t("moduleVisits") : t("moduleTags")}
    </span>
  );
}
