import type { ReactNode } from "react";
import { PAGE_GRADIENT } from "./surface";

/** Full-height page with Xpot's dark gradient and faint dot grid. */
export function AppBackground({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-white" style={{ background: PAGE_GRADIENT }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      {children}
    </div>
  );
}
