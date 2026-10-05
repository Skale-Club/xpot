import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Laptop, X } from "lucide-react";
import type { ProvisionerDeviceItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { BTN, BTN_DANGER, CARD, Empty, INPUT, SectionTitle } from "./ui";
import { ConfirmDialog, ErrorLine, Loading } from "./batches-shared";

const DEVICE_TONES: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-300",
  pairing: "bg-amber-400/10 text-amber-300",
  revoked: "bg-white/5 text-white/40",
};

const DEVICE_KEYS = { active: "device_active", pairing: "device_pairing", revoked: "device_revoked" } as const;

function DevicePill({ status }: { status: string }) {
  const t = useT(manageTagsMessages);
  const key = DEVICE_KEYS[status as keyof typeof DEVICE_KEYS];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${DEVICE_TONES[status] ?? "bg-white/10 text-white/60"}`}>
      {key ? t(key) : status}
    </span>
  );
}

interface Pairing {
  code: string;
  expiresAt: string | null;
  deviceName: string;
}

function CopyButton({ value, label, copiedTitle }: { value: string; label: string; copiedTitle: string }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => toast({ title: copiedTitle }),
          () => toast({ title: t("couldNotCopy"), variant: "destructive" }),
        );
      }}
      className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
      aria-label={t("copyLabel", { label: label.toLowerCase() })}
    >
      <Copy className="h-4 w-4" />
    </button>
  );
}

function PairingCode({ pairing, onClose }: { pairing: Pairing; onClose: () => void }) {
  const t = useT(manageTagsMessages);
  const server = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="relative rounded-2xl border border-blue-500/30 bg-blue-500/[0.06] p-5" data-testid="admin-tags-pairing-code">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
        aria-label={t("hidePairingCode")}
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-center text-xs text-white/50">{t("pairingCodeFor", { name: pairing.deviceName })}</p>
      <div className="my-2 flex items-center justify-center gap-2">
        <p className="select-all font-mono text-4xl font-bold tracking-[0.2em] text-white">{pairing.code}</p>
        <CopyButton value={pairing.code} label={t("pairingCodeLabel")} copiedTitle={t("pairingCodeCopied")} />
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
          <span className="inline-flex items-center gap-1 font-mono text-white">
            {server}
            <CopyButton value={server} label={t("serverAddressLabel")} copiedTitle={t("serverAddressCopied")} />
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
  const { data: devices = [], isLoading, isError } = useQuery<ProvisionerDeviceItem[]>({
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
      <section className={`${CARD} space-y-4 p-5`}>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="h-4 w-4 text-white/50" />
            {t("pairComputer")}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {t("pairComputerHint")}
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("computerNamePlaceholder")}
            maxLength={80}
            className={INPUT}
            data-testid="admin-tags-provisioner-name"
          />
          <button type="submit" disabled={!name.trim() || create.isPending} className={`${BTN} shrink-0`}>
            {create.isPending ? t("creating") : t("createPairingCode")}
          </button>
        </form>
        {pairing && <PairingCode pairing={pairing} onClose={() => setPairing(null)} />}
      </section>

      <section>
        <SectionTitle>{t("computers")}</SectionTitle>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorLine>{t("computersLoadError")}</ErrorLine>
        ) : devices.length === 0 ? (
          <Empty>{t("noComputers")}</Empty>
        ) : (
          <ul className={`${CARD} divide-y divide-white/5`}>
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
                  <button type="button" onClick={() => setRevoking(d)} disabled={revoke.isPending} className={`${BTN_DANGER} shrink-0`}>
                    {d.status === "pairing" ? t("cancelCode") : t("revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
        destructive
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
