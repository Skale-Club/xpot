import { useState } from "react";
import {
  Plus,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from '@/components/ui/loader';
import type { SalesLead, FullSalesLead } from "../types";

type LeadLike = SalesLead | FullSalesLead;

const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors";
const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" };

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-0.5">{label}</div>
      {children}
    </div>
  );
}

function Field({ value, onChange, placeholder, type, inputMode }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      className={inputCls}
      style={inputStyle}
    />
  );
}

export function EditLeadDialog({ lead, open, onOpenChange, onSaved }: {
  lead: LeadLike;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const loc = (lead as FullSalesLead).locations?.[0];
  const [form, setForm] = useState({
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    website: lead.website || "",
    industry: lead.industry || "",
    addressLine1: loc?.addressLine1 || "",
    city: loc?.city || "",
    state: loc?.state || "",
    postalCode: loc?.postalCode || "",
  });
  const [socials, setSocials] = useState<{platform: string, url: string}[]>(
    ((lead as any).socialUrls as {platform: string, url: string}[]) || []
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        industry: form.industry || undefined,
        socialUrls: socials.filter(s => s.url.trim().length > 0),
      });
      if (form.addressLine1 || form.city || form.state || form.postalCode) {
        await apiRequest("PATCH", `/api/xpot/leads/${lead.id}/location`, {
          addressLine1: form.addressLine1 || "",
          city: form.city || undefined,
          state: form.state || undefined,
          postalCode: form.postalCode || undefined,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Lead updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update lead", description: error.message, variant: "destructive" });
    },
  });

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">Edit Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <FieldGroup label="Business">
            <Field value={form.name} onChange={f("name")} placeholder="Business name" />
          </FieldGroup>

          <FieldGroup label="Contact">
            <Field value={form.phone} onChange={f("phone")} placeholder="Phone" inputMode="tel" />
            <Field value={form.email} onChange={f("email")} placeholder="Email" type="email" inputMode="email" />
            <Field value={form.website} onChange={f("website")} placeholder="Website" />
          </FieldGroup>

          <FieldGroup label="Details">
            <Field value={form.industry} onChange={f("industry")} placeholder="Industry" />
          </FieldGroup>

          <FieldGroup label="Social Networks">
            {socials.map((s, i) => (
              <div key={i} className="flex gap-2 items-center mb-2">
                <select 
                  value={s.platform} 
                  onChange={e => {
                    const next = [...socials];
                    next[i].platform = e.target.value;
                    setSocials(next);
                  }}
                  className="h-10 w-24 shrink-0 rounded-xl px-2 text-sm text-white focus:outline-none"
                  style={inputStyle}
                >
                  <option value="instagram" className="bg-[#0e1117]">Instagram</option>
                  <option value="linkedin" className="bg-[#0e1117]">LinkedIn</option>
                  <option value="facebook" className="bg-[#0e1117]">Facebook</option>
                  <option value="twitter" className="bg-[#0e1117]">X</option>
                  <option value="youtube" className="bg-[#0e1117]">YouTube</option>
                  <option value="tiktok" className="bg-[#0e1117]">TikTok</option>
                  <option value="other" className="bg-[#0e1117]">Other</option>
                </select>
                <input 
                  value={s.url}
                  onChange={e => {
                    const next = [...socials];
                    next[i].url = e.target.value;
                    setSocials(next);
                  }}
                  placeholder="URL or handle"
                  className={inputCls}
                  style={inputStyle}
                />
                <button type="button" onClick={() => setSocials(socials.filter((_, idx) => idx !== i))} className="p-2 text-white/40 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
               type="button"
               onClick={() => setSocials([...socials, { platform: "instagram", url: "" }])}
               className="text-xs flex items-center font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Social Network
            </button>
          </FieldGroup>

          <FieldGroup label="Address">
            <Field value={form.addressLine1} onChange={f("addressLine1")} placeholder="Street address" />
            <div className="grid grid-cols-2 gap-2">
              <Field value={form.city} onChange={f("city")} placeholder="City" />
              <Field value={form.state} onChange={f("state")} placeholder="State" />
            </div>
            <Field value={form.postalCode} onChange={f("postalCode")} placeholder="Postal code" />
          </FieldGroup>

          <button
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
          >
            {updateMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
            Save Changes
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
