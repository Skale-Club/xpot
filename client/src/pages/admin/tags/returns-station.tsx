import { useEffect, useMemo, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { TAG_MAX_BATCH_QUANTITY } from "@shared/tags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { useT } from "@/i18n";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { addCodes } from "./distribution-model";
import { readCode } from "./batches-model";
import { CodeCheckList, useCodeCheck } from "./code-check-list";
import { useReturnToHouse } from "./kits-list";
import { CameraButton, CodeEntry, ContinuousCamera, feedback } from "./scan-station";

/**
 * Distribution › Take back: a scan station for pieces a reseller hands back. Each code read or typed joins the list
 * with the server's answer (can it come back, and why not: "set up: remove the customer first", "sold", "not with a
 * reseller"); one action then takes back every piece that can.
 */
export function ReturnsStation() {
  const t = useT(adminTagsFlowMessages);
  const tb = useT(manageTagsBatchesMessages);
  const [codes, setCodes] = useState<string[]>([]);
  const [camera, setCamera] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const check = useCodeCheck("takeBack", codes);
  const okCodes = useMemo(() => codes.filter((code) => check.data?.items.find((i) => i.code === code)?.ok), [codes, check.data]);
  const checked = !check.isFetching && !!check.data && codes.every((code) => check.data!.items.some((i) => i.code === code));
  const ret = useReturnToHouse(() => {
    setConfirm(false);
    setCodes((list) => list.filter((code) => !okCodes.includes(code)));
  });

  // The beep for a camera read waits for the server's answer on that code.
  const awaiting = useRef<string | null>(null);
  useEffect(() => {
    const code = awaiting.current;
    if (!code || check.isFetching) return;
    const item = check.data?.items.find((i) => i.code === code);
    if (!item) return;
    awaiting.current = null;
    feedback(item.ok ? "ok" : "warn");
  }, [check.data, check.isFetching]);

  const addReads = (reads: string[], fromCamera = false) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of reads) {
      const code = readCode(raw, [window.location.hostname]);
      if (code) valid.push(code);
      else invalid.push(raw);
    }
    const result = addCodes(codes, valid);
    if (result.list.length > TAG_MAX_BATCH_QUANTITY) {
      setEntryError(tb("atMostCodes", { max: TAG_MAX_BATCH_QUANTITY }));
      feedback("error");
      return;
    }
    setCodes(result.list);
    setEntryError(invalid.length ? tb("notACode", { codes: invalid.slice(0, 6).join(", ") }) : result.repeated.length ? t("alreadyOnList", { codes: result.repeated.slice(0, 6).join(", ") }) : null);
    if (invalid.length) feedback("error");
    else if (!result.added.length && (fromCamera || reads.length === 1)) feedback("warn");
    else if (result.added.length === 1) awaiting.current = result.added[0];
  };

  return (
    <div className="space-y-3" data-testid="admin-tags-returns">
      <p className="text-sm text-white/55">{t("returnsIntro")}</p>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <CodeEntry onReads={(reads) => addReads(reads)} testId="returns-code-entry" />
        </div>
        <CameraButton on={camera} onToggle={() => setCamera((v) => !v)} />
      </div>
      {camera ? <ContinuousCamera onRead={(text) => addReads([text], true)} onClose={() => setCamera(false)} /> : null}
      {entryError ? <p className="text-xs text-amber-300" role="status">{entryError}</p> : null}
      <CodeCheckList
        kind="takeBack"
        codes={codes}
        check={check.data}
        checking={check.isFetching}
        error={check.error}
        onRemove={(code) => setCodes((list) => list.filter((c) => c !== code))}
        onRemoveBlocked={() => setCodes(okCodes)}
        onClear={() => setCodes([])}
        testId="returns-code-list"
      />
      {/* Above the phone's tab bar (components/xpot/MobileTabBar.tsx), at the bottom on desktop. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+96px)] z-10 -mx-1 flex justify-end bg-gradient-to-t from-background via-background/90 to-transparent px-1 pb-1 pt-4 lg:bottom-0">

        <Button type="button" variant="brand" accent="tags" disabled={!okCodes.length || !checked || ret.isPending} onClick={() => setConfirm(true)} data-testid="returns-take-back">
          <Undo2 className="h-4 w-4" />
          {okCodes.length ? t.plural("takeBackN", okCodes.length) : t("takeBackNone")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={tb.plural("returnConfirmTitle", okCodes.length)}
        description={t("takeBackDesc")}
        confirmLabel={tb("returnToHouse")}
        busy={ret.isPending}
        onConfirm={() => ret.mutate(okCodes)}
      />
    </div>
  );
}
