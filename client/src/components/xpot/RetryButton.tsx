import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/**
 * The one "Try again" action under a failed load: EmptyState / ErrorState draw
 * it for `onRetry`, and screens with their own error block use it directly.
 * `busy` shows the loader while the refetch runs.
 */
export function RetryButton({ onRetry, busy = false, label }: { onRetry: () => void; busy?: boolean; label?: string }) {
  const tc = useT(commonMessages);
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onRetry} loading={busy}>
      <RotateCw aria-hidden="true" />
      {label ?? tc("retry")}
    </Button>
  );
}
