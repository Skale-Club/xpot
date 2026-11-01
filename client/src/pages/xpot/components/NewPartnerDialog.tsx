import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Handshake, Printer } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { Field, Input } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { describeApiError } from "@/lib/apiErrors";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { partnerMaterialsMessages } from "@/i18n/messages/partnerMaterials";
import { ReleasedModelsField } from "./ReleasedModelsField";

// "New partner" on the Organizations list (platform only): the owner's account, the organization that prints its own
// pieces and the models released to it, in one request (POST /api/xpot/organizations/partners). It ends on the next
// step, pairing their print station, because nothing prints until a computer is paired to the organization.

type Partner = { id: number; name: string };

export function NewPartnerDialog() {
  const m = useT(partnerMaterialsMessages);
  const tc = useT(commonMessages);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [countryCode, setCountryCode] = useState("1");
  const [phone, setPhone] = useState("");
  const [released, setReleased] = useState<string[]>([]);
  const [created, setCreated] = useState<Partner | null>(null);

  const reset = () => {
    setOpen(false);
    setName("");
    setOwnerName("");
    setCountryCode("1");
    setPhone("");
    setReleased([]);
    setCreated(null);
    create.reset();
  };
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/xpot/organizations/partners", {
      name: name.trim(), ownerName: ownerName.trim(), phone: phone.trim(), countryCode, releasedPrintModels: released,
    })).json() as Promise<Partner>,
    onSuccess: (partner) => {
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/admin/reps"] });
      setCreated(partner);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!create.isPending) create.mutate();
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="new-partner-open">
        <Handshake />
        {m("newPartner")}
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => { if (!next && !create.isPending) reset(); }}>
          <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto" data-testid="new-partner-dialog">
            {created ? (
              <>
                <DialogHeader>
                  <DialogTitle>{m("partnerCreated", { name: created.name })}</DialogTitle>
                  <DialogDescription>{m("partnerNextTitle")}</DialogDescription>
                </DialogHeader>
                <p className="text-sm text-white/65">{m("partnerNextBody")}</p>
                <DialogFooter className="gap-2">
                  <Button asChild variant="ghost" onClick={reset}>
                    <Link href={`/organizations/${created.id}`}>{m("partnerOpen")}</Link>
                  </Button>
                  <Button asChild variant="brand" accent="tags" onClick={reset} data-testid="new-partner-pair">
                    <Link href="/admin/tags/provisioners">
                      <Printer />
                      {m("partnerPair")}
                    </Link>
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <form onSubmit={submit} className="space-y-4" data-testid="new-partner-form">
                <DialogHeader>
                  <DialogTitle>{m("newPartnerTitle")}</DialogTitle>
                  <DialogDescription>{m("newPartnerIntro")}</DialogDescription>
                </DialogHeader>
                <Field label={m("partnerOrgName")} required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} placeholder={m("partnerOrgNamePlaceholder")} required data-testid="new-partner-name" />
                </Field>
                <Field label={m("partnerOwnerName")} required>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100} required data-testid="new-partner-owner" />
                </Field>
                <Field label={m("partnerOwnerPhone")} hint={m("partnerPhoneHint")} required>
                  <div className="flex min-h-11 gap-2">
                    <CountryCodePicker value={countryCode} onChange={setCountryCode} label={m("partnerCountry")} />
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required aria-label={m("partnerOwnerPhone")} data-testid="new-partner-phone" />
                  </div>
                </Field>
                <ReleasedModelsField value={released} onChange={setReleased} />
                {create.error ? <InlineAlert tone="error">{m("couldNotCreatePartner")}: {describeApiError(create.error)}</InlineAlert> : null}
                <DialogFooter className="gap-2">
                  <Button type="button" variant="ghost" onClick={reset} disabled={create.isPending}>{tc("cancel")}</Button>
                  <Button type="submit" variant="brand" loading={create.isPending} disabled={!name.trim() || !ownerName.trim() || !phone.trim()} data-testid="new-partner-submit">
                    {m("partnerCreate")}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
