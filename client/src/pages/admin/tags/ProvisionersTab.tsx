import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Laptop, X } from "lucide-react";
import type { ProvisionerDeviceItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Input } from "@/components/xpot/Field";
import { PROVISIONER_STATUS_TONE, Pill, toneOf } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading } from "./pieces-shared";

const DEVICE_KEYS = { active: "device_active", pairing: "device_pairing", revoked: "device_revoked" } as const;

function DevicePill({ status }: { status: string }) {
  const t = useT(manageTagsMessages);
  const key = DEVICE_KEYS[status as keyof typeof DEVICE_KEYS];
  return <Pill tone={toneOf(PROVISIONER_STATUS_TONE, status)}>{key ? t(key) : status}</Pill>;
}

interface Pairing {
  code: string;
  expiresAt: string | null;
  deviceName: string;
}

function PairingCode({ pairing, onClose }: { pairing: Pairing; onClose: () => void }) {
  const t = useT(manageTagsMessages);
  const server = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="relative rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-5" data-testid="admin-tags-pairing-code">
      <Button type="button" variant="ghost" size="icon" onClick={onClose} className="absolute right-1 top-1" aria-label={t("hidePairingCode")}>
        <X className="h-4 w-4" />
      </Button>
      <p className="text-center text-xs text-white/50">{t("pairingCodeFor", { name: pairing.deviceName })}</p>
      <div className="my-2 flex flex-wrap items-center justify-center gap-2">
        <p className="select-all font-mono text-3xl font-bold tracking-[0.2em] text-white sm:text-4xl">{pairing.code}</p>
        <CopyButton value={pairing.code} iconOnly label={t("copyLabel", { label: t("pairingCodeLabel").toLowerCase() })} />
      </div>
      <p className="text-center text-xs text-white/45">{t("pairingCodeExpiry", { date: formatDateTime(pairing.expiresAt) })}</p>
      <ol className="mx-auto mt-4 max-w-md list-decimal space-y-1 pl-5 text-sm text-white/70">
        <li>
          {t("pairStep1Before")}
          <span className="font-semibold text-white">Xpot NFC Writer</span>
          {t("pairStep1After")}
        </li>
        <li>
          {t("pairStep2")}{" "}
          <span className="inline-flex max-w-full items-center gap-1 break-all font-mono text-white">
            {server}
            <CopyButton value={server} iconOnly label={t("copyLabel", { label: t("serverAddressLabel").toLowerCase() })} />
          </span>
        </li>
        <li>{t("pairStep3")}</li>
        <li>
          {t("pairStep4Before")}
          <span className="font-semibold text-emerald-300">{t("device_active")}</span>
          {t("pairStep4After")}
        </li>
      </ol>
    </div>
  );
}

/** Desktop "Xpot NFC Writer" installs: pair a computer, see when it was last seen, revoke it. */
export function ProvisionersTab(_props: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [revoking, setRevoking] = useState<ProvisionerDeviceItem | null>(null);
  const { data: devices = [], isLoading, error, refetch } = useQuery<ProvisionerDeviceItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "provisioners"],
    queryFn: () => getJson("/api/xpot/admin/tag-provisioners"),
    staleTime: STALE_MS,
    // While a code is waiting, poll so the device flips to active by itself.
    refetchInterval: (query) => (pairing || query.state.data?.some((d) => d.status === "pairing") ? 5000 : false),
  });

  const create = useMutation({
    mutationFn: () =>
      sendJson<{ pairingCode: string; device: ProvisionerDeviceItem }>("POST", "/api/xpot/admin/tag-provisioners", { deviceName: name.trim() }),
    onSuccess: (r) => {
      setPairing({ code: r.pairingCode, expiresAt: r.device.pairingExpiresAt, deviceName: r.device.deviceName });
      setName("");
      void invalidateAdminTags();
    },
    onError: (err) => toast({ title: t("couldNotCreatePairingCode"), description: errorMessage(err), variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => sendJson<ProvisionerDeviceItem>("POST", `/api/xpot/admin/tag-provisioners/${encodeURIComponent(id)}/revoke`),
    onSuccess: (device) => {
      void invalidateAdminTags();
      setRevoking(null);
      toast({ title: t("deviceRevokedToast", { name: device.deviceName }) });
    },
    onError: (err) => toast({ title: t("couldNotRevoke"), description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !create.isPending) create.mutate();
  };

  return (
    <div className="space-y-6">
      <SectionCard accent="tags" icon={KeyRound} title={t("pairComputer")} bodyClassName="space-y-4 p-4">
        <p className="text-xs text-white/45">{t("pairComputerHint")}</p>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("computerNamePlaceholder")}
            aria-label={t("computerNamePlaceholder")}
            maxLength={80}
            data-testid="admin-tags-provisioner-name"
          />
          <Button type="submit" variant="brand" accent="tags" className="shrink-0" disabled={!name.trim()} loading={create.isPending}>
            {t("createPairingCode")}
          </Button>
        </form>
        {pairing && <PairingCode pairing={pairing} onClose={() => setPairing(null)} />}
      </SectionCard>

      <SectionCard accent="tags" icon={Laptop} title={t("computers")} bodyClassName="p-3">
        {isLoading ? (
          <Loading rows={2} />
        ) : error ? (
          <ErrorState compact title={t("computersLoadError")} message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : devices.length === 0 ? (
          <EmptyState compact tone="tags" icon={Laptop} title={t("noComputers")} cardStyle={{}} />
        ) : (
          <ul className={`divide-y divide-white/5 rounded-2xl ${GLASS_CLASS}`}>
            {devices.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`admin-tags-provisioner-${d.id}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <Laptop className="h-5 w-5 shrink-0 text-white/40" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      <span className="truncate">{d.deviceName}</span>
                      <DevicePill status={d.status} />
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {d.status === "pairing"
                        ? t("deviceCodeUnused", { date: formatDateTime(d.pairingExpiresAt) })
                        : d.status === "revoked"
                          ? d.pairedAt
                            ? t("deviceRevokedPairedAt", { revoked: formatDateTime(d.revokedAt), paired: formatDateTime(d.pairedAt) })
                            : t("deviceRevokedAt", { revoked: formatDateTime(d.revokedAt) })
                          : t(d.tokenPrefix ? "deviceSeenToken" : "deviceSeen", {
                              platform: d.platform ?? t("unknownOs"),
                              version: d.appVersion ?? "?",
                              date: formatDateTime(d.lastSeenAt),
                              token: d.tokenPrefix ?? "",
                            })}
                    </p>
                  </div>
                </div>
                {d.status !== "revoked" && (
                  <Button type="button" variant="danger" size="sm" className="min-h-10 shrink-0 self-start sm:self-auto" onClick={() => setRevoking(d)} disabled={revoke.isPending}>
                    {d.status === "pairing" ? t("cancelCode") : t("revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t(revoking?.status === "pairing" ? "cancelCodeTitle" : "revokeNamedTitle", { name: revoking?.deviceName ?? "" })}
        description={
          revoking?.status === "pairing"
            ? t("cancelCodeDesc")
            : t("revokeDeviceDesc")
        }
        confirmLabel={revoking?.status === "pairing" ? t("cancelCode") : t("revoke")}
        tone="danger"
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
