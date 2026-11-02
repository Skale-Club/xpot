import type { ReactNode } from "react";
import { CARD, EYEBROW_MUTED } from "./ui";

export function Panel({ title, right, children, collapsed = false }: { title: ReactNode; right?: ReactNode; children: ReactNode; collapsed?: boolean }) {
  return (
    <section className={`${CARD} p-4`}>
      <div className={`flex items-center justify-between gap-2 ${collapsed ? "" : "mb-3"}`}>
        <h2 className={EYEBROW_MUTED}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
