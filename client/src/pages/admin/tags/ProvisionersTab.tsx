import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Laptop, X } from "lucide-react";
import type { ProvisionerDeviceItem } from "@shared/tagsApi";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson } from "./api";
import { BTN, BTN_DANGER, CARD, Empty, INPUT, SectionTitle } from "./ui";
import { ConfirmDialog, ErrorLine, Loading } from "./batches-shared";

const DEVICE_TONES: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-300",
  pairing: "bg-amber-400/10 text-amber-300",
  revoked: "bg-white/5 text-white/40",
};

function DevicePill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${DEVICE_TONES[status] ?? "bg-white/10 text-white/60"}`}>
      {status === "pairing" ? "waiting for code" : status}
    </span>
  );
}

interface Pairing {
  code: string;
  expiresAt: string | null;
  deviceName: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => toast({ title: `${label} copied` }),
          () => toast({ title: "Could not copy", variant: "destructive" }),
        );
      }}
      className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      <Copy className="h-4 w-4" />
    </button>
  );
}

function PairingCode({ pairing, onClose }: { pairing: Pairing; onClose: () => void }) {
  const server = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="relative rounded-2xl border border-blue-500/30 bg-blue-500/[0.06] p-5" data-testid="admin-tags-pairing-code">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
        aria-label="Hide pairing code"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-center text-xs text-white/50">Pairing code for {pairing.deviceName}</p>
      <div className="my-2 flex items-center justify-center gap-2">
        <p className="select-all font-mono text-4xl font-bold tracking-[0.2em] text-white">{pairing.code}</p>
        <CopyButton value={pairing.code} label="Pairing code" />
      </div>
      <p className="text-center text-xs text-white/45">Single use · expires {formatDateTime(pairing.expiresAt)} · shown only once</p>
      <ol className="mx-auto mt-4 max-w-md list-decimal space-y-1 pl-5 text-sm text-white/70">
        <li>On the computer with the USB NFC reader, open the <span className="font-semibold text-white">Xpot NFC Writer</span> desktop app.</li>
        <li>
          Server address:{" "}
          <span className="inline-flex items-center gap-1 font-mono text-white">
            {server}
            <CopyButton value={server} label="Server address" />
          </span>
        </li>
        <li>Type the pairing code above and press Pair.</li>
        <li>This list shows the computer as <span className="font-semibold text-emerald-300">active</span> once it's paired.</li>
      </ol>
    </div>
  );
}

/** Desktop "Xpot NFC Writer" installs: pair a computer, see when it was last seen, revoke it. */
export function ProvisionersTab(_props: { go: (path: string) => void }) {
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
    onError: (err) => toast({ title: "Could not create a pairing code", description: errorMessage(err), variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => sendJson<ProvisionerDeviceItem>("POST", `/api/xpot/admin/tag-provisioners/${encodeURIComponent(id)}/revoke`),
    onSuccess: (device) => {
      void invalidateAdminTags();
      setRevoking(null);
      toast({ title: `${device.deviceName} revoked` });
    },
    onError: (err) => toast({ title: "Could not revoke", description: errorMessage(err), variant: "destructive" }),
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
            Pair a computer
          </p>
          <p className="mt-1 text-xs text-white/45">
            Install the Xpot NFC Writer desktop app on the computer with the USB NFC reader, then pair it with a one-time code. The app
            gets a token that can only fetch and report NFC writing jobs — no admin access.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Computer name, e.g. Workshop PC"
            maxLength={80}
            className={INPUT}
            data-testid="admin-tags-provisioner-name"
          />
          <button type="submit" disabled={!name.trim() || create.isPending} className={`${BTN} shrink-0`}>
            {create.isPending ? "Creating…" : "Create pairing code"}
          </button>
        </form>
        {pairing && <PairingCode pairing={pairing} onClose={() => setPairing(null)} />}
      </section>

      <section>
        <SectionTitle>Computers</SectionTitle>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorLine>Could not load NFC writers.</ErrorLine>
        ) : devices.length === 0 ? (
          <Empty>No computers paired yet.</Empty>
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
                        ? `Code not used yet · expires ${formatDateTime(d.pairingExpiresAt)}`
                        : d.status === "revoked"
                          ? `Revoked ${formatDateTime(d.revokedAt)}${d.pairedAt ? ` · paired ${formatDateTime(d.pairedAt)}` : ""}`
                          : `${d.platform ?? "Unknown OS"} · v${d.appVersion ?? "?"} · last seen ${formatDateTime(d.lastSeenAt)}${d.tokenPrefix ? ` · token ${d.tokenPrefix}…` : ""}`}
                    </p>
                  </div>
                </div>
                {d.status !== "revoked" && (
                  <button type="button" onClick={() => setRevoking(d)} disabled={revoke.isPending} className={`${BTN_DANGER} shrink-0`}>
                    {d.status === "pairing" ? "Cancel code" : "Revoke"}
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
        title={revoking?.status === "pairing" ? `Cancel the code for “${revoking?.deviceName}”?` : `Revoke “${revoking?.deviceName}”?`}
        description={
          revoking?.status === "pairing"
            ? "The pairing code stops working."
            : "It stops working immediately and its open NFC jobs are cancelled. Pair it again with a new code to use it."
        }
        confirmLabel={revoking?.status === "pairing" ? "Cancel code" : "Revoke"}
        destructive
        busy={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
