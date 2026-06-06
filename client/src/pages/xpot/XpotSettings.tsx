import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff, Loader2, Save, ChevronDown } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { XpotMeResponse } from "./types";

const COUNTRIES = [
  { code: "BR", dial: "+55", name: "Brazil" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "ES", dial: "+34", name: "Spain" },
  { code: "IT", dial: "+39", name: "Italy" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "MX", dial: "+52", name: "Mexico" },
  { code: "AR", dial: "+54", name: "Argentina" },
  { code: "CL", dial: "+56", name: "Chile" },
  { code: "CO", dial: "+57", name: "Colombia" },
  { code: "AU", dial: "+61", name: "Australia" },
  { code: "JP", dial: "+81", name: "Japan" },
  { code: "IN", dial: "+91", name: "India" },
  { code: "CN", dial: "+86", name: "China" },
];

function parsePhone(phone: string): { dial: string; local: string } {
  for (const c of COUNTRIES) {
    if (phone.startsWith(c.dial)) return { dial: c.dial, local: phone.slice(c.dial.length).trim() };
  }
  return { dial: "+1", local: phone };
}

function maskLocal(dial: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (dial === "+1") {
    const d = digits.slice(0, 10);
    if (d.length <= 3) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return digits;
}

function CountryPhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parsed = parsePhone(value);
  const active = COUNTRIES.find((c) => c.dial === parsed.dial) ?? COUNTRIES[1];
  const [local, setLocal] = useState(parsed.local);

  useEffect(() => {
    const { dial, local: l } = parsePhone(value);
    setLocal(l);
    const found = COUNTRIES.find((c) => c.dial === dial) ?? COUNTRIES[1];
    if (found.code !== active.code) {
      // country changed externally
    }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectCountry(c: (typeof COUNTRIES)[0]) {
    setOpen(false);
    onChange(`${c.dial} ${local}`);
  }

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskLocal(active.dial, e.target.value);
    setLocal(masked);
    onChange(`${active.dial} ${masked}`);
  }

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-l-2xl border border-r-0 border-white/5 bg-white/[0.03] px-3 py-3 text-sm text-white/80 hover:bg-white/[0.06] transition-colors shrink-0"
      >
        <ReactCountryFlag countryCode={active.code} svg className="h-4 w-5 rounded-sm object-cover" />
        <span className="text-white/60 text-xs font-medium">{active.dial}</span>
        <ChevronDown className="h-3 w-3 text-white/40" />
      </button>
      <input
        type="tel"
        value={local}
        onChange={handleLocalChange}
        placeholder={active.code === "BR" ? "(11) 99999-9999" : "(555) 000-0000"}
        className="w-full rounded-r-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[#0f111a] p-1 shadow-2xl">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => selectCountry(c)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                c.code === active.code ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <ReactCountryFlag countryCode={c.code} svg className="h-4 w-5 rounded-sm object-cover" />
              <span className="text-white/50 text-xs w-10 shrink-0">{c.dial}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">{title}</h2>
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</label>
      {children}
    </div>
  );
}

export function XpotSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [initialized, setInitialized] = useState(false);

  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const me = meQuery.data;

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [showPwd, setShowPwd] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (me && !initialized) {
    setInitialized(true);
    setDisplayName(me.rep.displayName);
    setFirstName(me.user.firstName ?? "");
    setLastName(me.user.lastName ?? "");
    setPhone(me.rep.phone ?? "");
  }

  const profileMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/xpot/me", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: "Profile saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save profile", description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/xpot/me/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveProfile = async () => {
    if (!me) return;

    const patch: Record<string, unknown> = {};
    if (displayName !== me.rep.displayName) patch.displayName = displayName;
    if (phone !== (me.rep.phone ?? "")) patch.phone = phone;
    if (firstName !== (me.user.firstName ?? "")) patch.firstName = firstName || null;
    if (lastName !== (me.user.lastName ?? "")) patch.lastName = lastName || null;

    if (Object.keys(patch).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }

    profileMutation.mutate(patch);
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast({ title: "Enter a new password", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060912]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  const isSaving = profileMutation.isPending;

  return (
    <div className="min-h-screen text-white" style={{ background: "linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%)" }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="relative mx-auto w-full max-w-lg px-4 pb-20 pt-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            <p className="text-xs text-white/40">
              {me ? [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") || me.user.email : ""}
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Profile */}
          <Section title="Profile">
            <Field label="First Name">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label="Last Name">
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label="Display Name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label="Email">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                {me?.user.email ?? "—"}
              </div>
            </Field>
            <Field label="Phone">
              <CountryPhoneInput value={phone} onChange={setPhone} />
            </Field>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSaving || !displayName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] touch-manipulation"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(99,102,241,0.25)" }}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{isSaving ? "Saving…" : "Save Profile"}</span>
            </button>
          </Section>

          {/* Password */}
          <Section title="Security">
            <Field label="Current Password">
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 pr-11 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="New Password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={passwordMutation.isPending || !currentPassword || !newPassword || newPassword !== confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] hover:bg-white/[0.06] touch-manipulation"
            >
              {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{passwordMutation.isPending ? "Changing…" : "Change Password"}</span>
            </button>
          </Section>

          {/* Account Info */}
          <Section title="Account Info">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                  {me?.rep.role ?? "—"}
                </div>
              </Field>
              <Field label="Team">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                  {me?.rep.team ?? "—"}
                </div>
              </Field>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
