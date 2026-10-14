import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { dashboardMessages } from "@/i18n/messages/dashboard";

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "greetingMorning" as const;
  if (hour < 18) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

function FadingLine({ children, className, title, fade = 28 }: {
  children: ReactNode;
  className: string;
  title?: string;
  fade?: number;
}) {
  const mask = `linear-gradient(90deg, #000 0%, #000 calc(100% - ${fade}px), transparent 100%)`;
  return (
    <div
      className={`w-full overflow-hidden whitespace-nowrap ${className}`}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
      title={title}
    >
      {children}
    </div>
  );
}

/** The same time-aware identity block on the phone header and desktop sidebar. */
export function UserGreeting({ name, compact = false }: { name: string; compact?: boolean }) {
  const t = useT(dashboardMessages);
  const date = new Date().toLocaleDateString(t.locale, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/80">
        {t(greetingKey())}
      </div>
      <FadingLine
        className={`${compact ? "mb-1 text-base" : "mb-1.5 text-[26px]"} font-extrabold leading-none tracking-tight text-white`}
        title={name}
        fade={compact ? 20 : 34}
      >
        {name} <span aria-hidden="true">👋</span>
      </FadingLine>
      <FadingLine className={`${compact ? "text-[11px] leading-4" : "text-xs"} font-medium text-white/45`} title={date} fade={18}>
        {date}
      </FadingLine>
    </div>
  );
}
