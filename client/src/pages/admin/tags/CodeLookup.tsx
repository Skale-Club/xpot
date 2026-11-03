import { useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { parseTagIntakeScan } from "@shared/tagIntake";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, getJson } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/xpot/Field";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

/**
 * Type the code printed on a piece, or paste what its QR / chip holds (https://xpot.place/q/CODE, /n/CODE, the app's
 * /tags/t/CODE), and open its record. Same parser as batch intake (shared/tagIntake.ts); the host serving the app
 * counts as a tag host too. On desktop it sits in the top bar (AdminApp).
 */
export function CodeLookup({ onFound, fill = false }: { onFound: (id: string) => void; /** Take the full row (the phone strip). */ fill?: boolean }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const scan = parseTagIntakeScan(code, [window.location.hostname]);
    const normalized = scan.ok ? scan.publicCode : null;
    if (!normalized) {
      toast({ title: t("invalidCode"), description: t("invalidCodeHint"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const tag = await getJson<{ id: string }>(`/api/xpot/tags/lookup/${normalized}`);
      setCode("");
      onFound(tag.id);
    } catch (err) {
      toast({ title: t("pieceNotFound"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={`flex min-w-0 gap-2 ${fill ? "w-full" : ""}`}>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("codePlaceholder")}
        aria-label={t("codePlaceholder")}
        className={`min-h-10 min-w-0 font-mono ${fill ? "flex-1" : "w-48 xl:w-60"}`}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        data-testid="admin-tag-code-lookup"
      />
      <Button type="submit" variant="brand" accent="tags" className="min-h-10 shrink-0" disabled={!code.trim()} loading={busy}>
        <ScanLine className="h-4 w-4" />
        {t("openPiece")}
      </Button>
    </form>
  );
}

