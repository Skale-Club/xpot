import { useT } from "@/i18n";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { systemReasonOf } from "@shared/tagReasons";

/**
 * How a stored reason reads: one the server wrote itself (a code, or the
 * English default older rows hold) in the reader's language; one a person
 * typed, as typed.
 */
export function useReasonText(): (reason: string | null | undefined) => string | null {
  const tp = useT(pieceScreenMessages);
  return (reason) => {
    if (!reason) return null;
    const code = systemReasonOf(reason);
    return code ? tp(`reason_${code}`) : reason;
  };
}
