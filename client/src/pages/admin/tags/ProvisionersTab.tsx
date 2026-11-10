import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Laptop, Monitor, Plus, X } from "lucide-react";
import type { ProvisionerDeviceItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { Input, Select } from "@/components/xpot/Field";
import { productionMessages } from "@/i18n/messages/production";
import { useProductionAccess } from "./production-shared";
import { PROVISIONER_STATUS_TONE, Pill, toneOf } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { Loading } from "./pieces-shared";
import { isWindows, ThisComputerSteps } from "./production-this-computer";
import { DesktopPreviewSwitcher } from "./DesktopPreviewSwitcher";

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

/**
 * Devices: what is connected to the organization (NFC writers, computers that generate print files), when each was
 * last seen, and Disconnect. Adding one is behind "Add device": this computer through Xpot Desktop, or another device
 * with a one-time code. Each works for one organization; the admin picks it once branches print.
 */
export function ProvisionersTab(_props: { go: (path: string) => void }) {
  const t = useT(manageTagsMessages);
  const tp = useT(productionMessages);
  const { toast } = useToast();
  const { organizations } = useProductionAccess();
  const [organizationId, setOrganizationId] = useState("");
  const organization = organizations.find((o) => String(o.id) === organizationId) ?? organizations[0];
  const organizationName = (id: number) => organizations.find((o) => o.id === id)?.name;
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [revoking, setRevoking] = useState<ProvisionerDeviceItem | null>(null);
  const [addOpen, setAddOpen] = useState<boolean | null>(null);
  const { data: devices = [], isLoading, error, refetch } = useQuery<ProvisionerDeviceItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "provisioners"],
    queryFn: () => getJson("/api/xpot/admin/tag-provisioners"),
    staleTime: STALE_MS,
    // While a code is waiting, poll so the device flips to active by itself.
    refetchInterval: (query) => (pairing || query.state.data?.some((d) => d.status === "pairing") ? 5000 : false),
  });

  const create = useMutation({
    mutationFn: () =>
      sendJson<{ pairingCode: string; device: ProvisionerDeviceItem }>("POST", "/api/xpot/admin/tag-provisioners", {
        deviceName: name.trim(),
        ...(organization ? { organizationId: organization.id } : {}),
      }),
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

  // The page is the list of what is connected; adding one waits behind "Add device" (open by itself when the list is
  // empty or a code is waiting): this computer by itself through Xpot Desktop, or another device with a one-time code.
  const adding = addOpen ?? (devices.length === 0 || !!pairing);

  return (
    <div className="space-y-6">
      <DesktopPreviewSwitcher />
      <SectionCard
        accent="tags"
        icon={Laptop}
        title={t("computers")}
        bodyClassName="space-y-3 p-3"
        actions={(
          <Button type="button" variant={adding ? "ghost" : "secondary"} size="sm" onClick={() => setAddOpen(!adding)} aria-expanded={adding} data-testid="admin-tags-add-device">
            {adding ? <X /> : <Plus />}{adding ? t("addDeviceClose") : t("addDevice")}
          </Button>
        )}
      >
        {adding ? (
          <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4" data-testid="admin-tags-add-device-panel">
            {isWindows() ? (
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Monitor className="h-4 w-4 text-white/50" aria-hidden="true" />{t("addThisComputer")}</h3>
                <ThisComputerSteps />
              </section>
            ) : null}
            <section className={`space-y-3 ${isWindows() ? "border-t border-white/[0.06] pt-5" : ""}`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-white/50" aria-hidden="true" />{t("pairComputer")}</h3>
              <p className="text-xs text-white/45">{t("pairComputerHint")}</p>
              <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
                {organizations.length > 1 ? (
                  <Select
                    value={organization ? String(organization.id) : ""}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    aria-label={tp("organization")}
                    options={organizations.map((o) => ({ value: String(o.id), label: o.name }))}
                    className="sm:w-56"
                    data-testid="admin-tags-provisioner-organization"
                  />
                ) : null}
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("computerNamePlaceholder")}
                  aria-label={t("computerNamePlaceholder")}
                  maxLength={80}
                  data-testid="admin-tags-provisioner-name"
                />
                <Button type="submit" variant="secondary" className="shrink-0" disabled={!name.trim()} loading={create.isPending}>
                  {t("createPairingCode")}
                </Button>
              </form>
              {pairing && <PairingCode pairing={pairing} onClose={() => setPairing(null)} />}
            </section>
          </div>
        ) : null}

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
                      {d.status === "active" ? d.capabilities.map((capability) => <Pill key={capability} tone={capability === "print" ? "blue" : "violet"}>{t(capability === "print" ? "deviceMakesFiles" : "deviceWritesChips")}</Pill>) : null}
                      {organizations.length > 1 && organizationName(d.organizationId) ? <Pill tone="slate">{organizationName(d.organizationId)}</Pill> : null}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {d.status === "pairing"
                        ? t("deviceCodeUnused", { date: formatDateTime(d.pairingExpiresAt) })
                        : d.status === "revoked"
                          ? d.pairedAt
                            ? t("deviceRevokedPairedAt", { revoked: formatDateTime(d.revokedAt), paired: formatDateTime(d.pairedAt) })
                            : t("deviceRevokedAt", { revoked: formatDateTime(d.revokedAt) })
                          : t("deviceSeen", {
                              platform: d.platform ? (["darwin", "win32", "linux"].includes(d.platform) ? t(`os_${d.platform}` as "os_linux") : d.platform) : t("unknownOs"),
                              date: formatDateTime(d.lastSeenAt),
                            })}
                    </p>
                  </div>
                </div>
                {d.status !== "revoked" && (
                  <Button type="button" variant="ghost" size="sm" className="min-h-10 shrink-0 self-start text-white/55 sm:self-auto" onClick={() => setRevoking(d)} disabled={revoke.isPending}>
                    {d.status === "pairing" ? t("cancelCode") : t("disconnect")}
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
        title={t(revoking?.status === "pairing" ? "cancelCodeTitle" : "disconnectNamedTitle", { name: revoking?.deviceName ?? "" })}
        description={
          revoking?.status === "pairing"
            ? t("cancelCodeDesc")
            : t("revokeDeviceDesc")
        }
        confirmLabel={revoking?.status === "pairing" ? t("cancelCode") : t("disconnect")}
        tone="danger"
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
