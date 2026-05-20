import type { HTMLAttributes } from "react";

import { DotsLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function resolveLoaderSize(className = ""): "xs" | "sm" | "md" | "lg" {
  if (/\b(?:w|h)-(?:8|9|10|11|12)\b/.test(className)) return "lg";
  if (/\b(?:w|h)-(?:6|7)\b/.test(className)) return "md";
  if (/\b(?:w|h)-5\b/.test(className)) return "sm";
  return "xs";
}

function stripSizeAndSpinClasses(className = "") {
  return className
    .replace(/\banimate-spin\b/g, "")
    .replace(/\b(?:w|h)-(?:3|4|5|6|7|8|9|10|11|12)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function Loader2({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const size = resolveLoaderSize(className);
  const cleanedClassName = stripSizeAndSpinClasses(className);

  return (
    <div
      {...props}
      className={cn("inline-flex items-center justify-center align-middle", cleanedClassName)}
    >
      <DotsLoader size={size} tone="current" />
    </div>
  );
}
