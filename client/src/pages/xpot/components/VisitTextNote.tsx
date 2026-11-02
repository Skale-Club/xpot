import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/xpot/Field";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";

/**
 * A note typed instead of recorded: for a quiet place, a noisy one, or a phone that may not use the microphone.
 * It is the visit's own summary, the same text a voice note's analysis fills, so what was typed shows where
 * the recording's summary does. The field starts with what is already saved.
 */
export function VisitTextNote({ visitId, saved }: { visitId: number; saved?: string | null }) {
  const t = useT(checkinMessages);
  const { toast } = useToast();
  const [text, setText] = useState(saved ?? "");
  useEffect(() => setText(saved ?? ""), [visitId, saved]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/xpot/visits/${visitId}/note`, { summary: text.trim() || null })).json(),
    onSuccess: async () => {
      toast({ title: t("noteSaved"), variant: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] }),
      ]);
    },
    onError: (error: Error) => toast({ title: t("noteSaveFailed"), description: error.message, variant: "destructive" }),
  });
  const changed = text.trim() !== (saved ?? "").trim();

  return (
    <div className="space-y-2" data-testid="visit-text-note">
      <Field label={t("orTypeNote")}>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={t("notePlaceholder")} rows={4} maxLength={5000} />
      </Field>
      {changed ? (
        <Button type="button" variant="brand" size="sm" onClick={() => save.mutate()} loading={save.isPending} className="w-full" data-testid="save-text-note">
          {t("saveNote")}
        </Button>
      ) : saved ? (
        <p className="text-xs text-white/45">{t("savedNote")}</p>
      ) : null}
    </div>
  );
}
