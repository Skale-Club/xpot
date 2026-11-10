import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "wouter";
import { phonePlaceholderFor } from "@shared/phone";
import {
  Building2,
  Camera,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Languages,
  LogOut,
  Save,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/ui/spinner";
import { SessionGate } from "@/components/xpot/SessionGate";
import { Field, FIELD_CONTROL, Input } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { PageHeader } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { describeApiError } from "@/lib/apiErrors";
import { useAvatarUpload } from "@/components/xpot/useAvatarUpload";
import { ACCENT_SELECTED, BRAND_GRADIENT, EYEBROW, GLASS_CLASS, SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { CountryFlag } from "@/components/CountryFlag";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/format";
import { LanguageList } from "@/components/LanguagePicker";
import { LANG_LABELS, useI18n, useT } from "@/i18n";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { commonMessages } from "@/i18n/messages/common";
import { settingsMessages } from "@/i18n/messages/settings";
import { navIaMessages } from "@/i18n/messages/navIa";
import { shellMessages } from "@/i18n/messages/shell";
import { SignOutConfirm } from "@/components/xpot/SignOutConfirm";
import { addPersonMessages } from "@/i18n/messages/addPerson";
import { organizationsMessages } from "@/i18n/messages/organizations";
import type { XpotMeResponse } from "./types";
import { AddPersonForm } from "./components/AddPersonForm";
import { AppLayout } from "@/components/xpot/AppLayout";
import { homeForModules, useXpotModules } from "@/components/ModuleSwitch";
import { InstallAppHeaderButton } from "@/components/xpot/InstallApp";
import { useAcademyAvailable } from "@/components/academy/useAcademyAvailable";
import { academyMessages } from "@/i18n/messages/academy";
import { SignInMethods } from "@/components/xpot/SignInMethods";
import { PANEL_ICON, usePanelSwitch } from "@/components/xpot/panelSwitch";
import { workspacesMessages } from "@/i18n/messages/workspaces";

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

// Settings has one menu, with each item showing only what belongs to it:
//   My account › Profile (photo, name, contact phone), Sign-in, Language
//   My company › Company details (its name, the person's role), People (owners only)
// On desktop the menu sits beside the open item; on a phone it is a list like the
// phone's own settings, each row opening its own screen. `?tab=` names the item.
const SETTINGS_SECTIONS = ["profile", "signin", "language", "company", "people"] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** `?tab=` of a link; one that names no section (the old "administration", "memberships") opens the first. */
function sectionFromParam(value: string | null): SettingsSection | null {
  if (value === "organization") return "company";
  return SETTINGS_SECTIONS.find((id) => id === value) ?? null;
}

/** Country name in the app's language; falls back to the English name. */
function countryName(code: string, fallback: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}


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
  const t = useT(settingsMessages);
  const parsed = parsePhone(value);
  const active = COUNTRIES.find((c) => c.dial === parsed.dial) ?? COUNTRIES[1];
  // Shown masked even when saved bare ("6175550106" reads (617) 555-0106), as the sign-in phone below it does.
  const [local, setLocal] = useState(maskLocal(parsed.dial, parsed.local));

  useEffect(() => {
    const { dial, local: l } = parsePhone(value);
    setLocal(maskLocal(dial, l));
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
        aria-expanded={open}
        aria-label={`${t("phone")}: ${active.dial}`}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-l-xl border border-r-0 border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
      >
        <CountryFlag iso={active.code} />
        <span className="text-white/60 text-xs font-medium">{active.dial}</span>
        <ChevronDown className="h-3 w-3 text-white/40" />
      </button>
      <input
        type="tel"
        value={local}
        onChange={handleLocalChange}
        placeholder={phonePlaceholderFor(active.dial)}
        className={`${FIELD_CONTROL} rounded-l-none py-2`}
      />
      {open && (
        <div className={`absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-y-auto rounded-xl ${SURFACE_MODAL_CLASS} p-1 shadow-2xl`}>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => selectCountry(c)}
              className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                c.code === active.code ? `${ACCENT_SELECTED.account.row} text-white` : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <CountryFlag iso={c.code} />
              <span className="text-white/50 text-xs w-10 shrink-0">{c.dial}</span>
              <span className="truncate">{countryName(c.code, c.name, t.locale)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A titled card. `titled={false}` where the screen header already says it (a phone's inner screen). */
function Section({ id, title, titled = true, children }: { id?: SettingsSection; title: string; titled?: boolean; children: React.ReactNode }) {
  return (
    <section id={id ? `settings-${id}` : undefined} aria-label={titled ? undefined : title} className="scroll-mt-24 space-y-3" data-testid={id ? `settings-section-${id}` : undefined}>
      {titled && <h2 className="px-1 text-base font-bold text-white/90">{title}</h2>}
      <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4`}>
        {children}
      </div>
    </section>
  );
}

type SettingsCompany = NonNullable<XpotMeResponse["organizations"]>[number];

/** A company's name and the person's role in it. Its owner can rename it; anyone else only reads it. */
function CompanyDetails({ organization, role }: { organization: SettingsCompany; role?: "admin" | "member" }) {
  const t = useT(addPersonMessages);
  const { toast } = useToast();
  const owner = role === "admin";
  const [name, setName] = useState(organization.name);
  const trimmed = name.trim();
  const dirty = trimmed !== organization.name;
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/xpot/organizations/${organization.id}`, { name: trimmed })).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] });
      toast({ title: t("companySaved"), variant: "success" });
    },
    onError: (error: Error) => toast({ title: describeApiError(error), variant: "destructive" }),
  });
  return (
    <div className="space-y-4" data-testid="settings-organization">
      <Field label={t("companyName")}>
        <Input value={name} onChange={(event) => setName(event.target.value)} readOnly={!owner} disabled={!owner} maxLength={120} data-testid="settings-organization-name" />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/55">{t("yourRole")}</span>
        <Pill tone="slate" data-testid="settings-organization-role">{t(owner ? "roleOwner" : "roleEmployee")}</Pill>
      </div>
      {owner ? (
        <FormFooter dirty={dirty} onCancel={dirty ? () => setName(organization.name) : undefined}>
          <Button variant="brand" onClick={() => save.mutate()} disabled={!dirty || trimmed.length < 2} loading={save.isPending} data-testid="settings-save-company">
            <Save />
            {t("saveCompany")}
          </Button>
        </FormFooter>
      ) : (
        <p className="text-sm leading-relaxed text-white/50">{t("employeeHint")}</p>
      )}
    </div>
  );
}

type CompanyMember = { repId: number; displayName: string; phone?: string | null; membershipRole: "admin" | "member"; isActive: boolean; blockedAt?: string | null };

/** Who is in a company, and adding someone. Removing or suspending someone stays on the company's Team page. */
function CompanyPeople({ organization, viewerRepId }: { organization: SettingsCompany; viewerRepId?: number }) {
  const t = useT(addPersonMessages);
  const to = useT(organizationsMessages);
  const members = useQuery<CompanyMember[]>({ queryKey: [`/api/xpot/organizations/${organization.id}/members`] });
  const list = members.data ?? [];
  return (
    <div className="space-y-4" data-testid="settings-people">
      <p className="text-sm leading-relaxed text-white/50">{t(organization.personal ? "soloHint" : "ownerHint")}</p>
      {list.length > 0 && (
        <ul className="divide-y divide-white/[0.06]" data-testid="settings-people-list">
          {list.map((member) => (
            <li key={member.repId} className="flex min-h-14 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{member.displayName}{member.repId === viewerRepId ? ` (${t("you")})` : ""}</span>
                {member.phone ? <span className="block truncate text-xs text-white/45">{formatPhone(member.phone)}</span> : null}
              </span>
              <Pill tone="slate">{!member.isActive || member.blockedAt ? to("memberSuspended") : t(member.membershipRole === "admin" ? "roleOwner" : "roleEmployee")}</Pill>
            </li>
          ))}
        </ul>
      )}
      {list.length > 1 && (
        <Button asChild variant="secondary"><Link href={`/organizations/${organization.id}?tab=team`} data-testid="settings-open-team"><Users className="h-4 w-4" />{t("openTeam")}</Link></Button>
      )}
      <AddPersonForm organizationId={organization.id} hint={false} />
    </div>
  );
}

export function XpotSettings() {
  const [, setLocation] = useLocation();
  const [params] = useSearchParams();
  const modules = useXpotModules();
  const { toast } = useToast();
  const t = useT(settingsMessages);
  const tc = useT(commonMessages);
  const tn = useT(navIaMessages);
  const ts = useT(shellMessages);
  const ta = useT(academyMessages);
  const { available: academy } = useAcademyAvailable();
  const tp = useT(addPersonMessages);
  const tw = useT(workspacesMessages);
  // On a phone the other panels (Production, Admin) are rows here, not buttons on the crowded header.
  const panelSwitch = usePanelSwitch();
  const otherPanels = panelSwitch.panels.filter((panel) => panel !== panelSwitch.current);
  const [signingOut, setSigningOut] = useState(false);
  const avatar = useAvatarUpload();
  const [initialized, setInitialized] = useState(false);
  const isDesktop = useIsDesktop();
  const { lang } = useI18n();
  // ?tab= names a section: on a phone it is the open inner screen (each one a
  // history entry, so the phone's Back returns to the list); on desktop the page
  // scrolls to it. Admin pages link back with ?tab=administration.
  const linkedSection = sectionFromParam(params.get("tab"));

  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const me = meQuery.data;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  if (me && !initialized) {
    setInitialized(true);
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
      toast({ title: t("profileSaved"), variant: "success" });
    },
    onError: (err: Error) => {
      toast({ title: t("profileSaveFailed"), description: err.message, variant: "destructive" });
    },
  });

  const handleSaveProfile = async () => {
    if (!me) return;

    const patch: Record<string, unknown> = {};
    if (phone !== (me.rep.phone ?? "")) patch.phone = phone;
    // Both together: the server writes the name the app shows from these two.
    if (firstName.trim() !== (me.user.firstName ?? "") || lastName.trim() !== (me.user.lastName ?? "")) {
      patch.firstName = firstName.trim();
      patch.lastName = lastName.trim() || null;
    }

    if (Object.keys(patch).length === 0) {
      toast({ title: t("noChanges") });
      return;
    }

    profileMutation.mutate(patch);
  };

  if (meQuery.isLoading) return <AppLoader />;
  // A failed /api/xpot/me must not mount the layout below: its children ask for /me again, which restarts the loader above, forever.
  if (!me) return <SessionGate error={meQuery.error} />;

  const savedName = { firstName: me.user.firstName ?? "", lastName: me.user.lastName ?? "" };
  const profileDirty = phone !== (me.rep.phone ?? "") || firstName.trim() !== savedName.firstName || lastName.trim() !== savedName.lastName;
  const resetProfile = () => {
    setFirstName(savedName.firstName);
    setLastName(savedName.lastName);
    setPhone(me.rep.phone ?? "");
  };

  const isSaving = profileMutation.isPending;

  const name = me ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() : "";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  // My company: the ones the person works in (a team before their own one-person workspace), each with their role in it.
  const myOrganizations = (me?.organizations ?? [])
    .map((organization) => ({ organization, membership: me?.organizationMemberships?.find((item) => item.organizationId === organization.id && item.isActive && !item.blockedAt) }))
    .filter((item) => item.membership);
  const teams = myOrganizations.filter((item) => !item.organization.personal);
  const companies = teams.length ? teams : myOrganizations.slice(0, 1);
  const ownedCompanies = companies.filter((item) => item.membership?.role === "admin");
  const namedCompanies = companies.length > 1;
  const menu: Array<{ title: string; items: Array<{ id: SettingsSection; icon: LucideIcon }> }> = [
    { title: t("groupAccount"), items: [{ id: "profile", icon: User }, { id: "signin", icon: KeyRound }, { id: "language", icon: Languages }] },
    ...(companies.length ? [{
      title: tp("sectionTitle"),
      items: [{ id: "company" as const, icon: Building2 }, ...(ownedCompanies.length ? [{ id: "people" as const, icon: Users }] : [])],
    }] : []),
  ];
  const openable = (id: SettingsSection | null) => !!id && menu.some((group) => group.items.some((item) => item.id === id));
  // A link to something this person does not have (People, for an employee) opens the menu's start instead.
  const openSection = openable(linkedSection) ? linkedSection : null;
  // One section's content. On a phone it is the inner screen, whose header
  // already carries the title (`titled` false); on desktop the stacked page.
  const renderSection = (id: SettingsSection, titled: boolean) => {
    switch (id) {
      case "profile":
        return (
          <Section key={id} id={id} title={t("sectionProfile")} titled={titled}>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={avatar.pick}
                disabled={avatar.pending}
                aria-label={avatar.label}
                className="group relative shrink-0 rounded-[22px] transition-transform active:scale-95 disabled:cursor-wait"
                data-testid="settings-avatar"
              >
                {me?.rep.avatarUrl ? (
                  <img src={me.rep.avatarUrl} alt="" className="h-16 w-16 rounded-[22px] border border-white/10 object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-[22px] text-xl font-bold text-white" style={{ background: BRAND_GRADIENT }}>
                    {initials}
                  </span>
                )}
                <span className={`absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/60 transition-opacity ${avatar.pending ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} aria-hidden="true">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              </button>
              <input {...avatar.inputProps} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{tn("photo")}</p>
                <p className="text-xs text-white/45">{tn(modules.includes("visits") ? "photoHint" : "photoHintTeam")}</p>
                <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={avatar.pick} loading={avatar.pending}>
                  <Camera />
                  {avatar.label}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("firstName")}>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("firstNamePlaceholder")} />
              </Field>
              <Field label={t("lastName")}>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("lastNamePlaceholder")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={tn("contactPhone")}>
                  <CountryPhoneInput value={phone} onChange={setPhone} />
                </Field>
              </div>
            </div>
            <FormFooter dirty={profileDirty} onCancel={profileDirty ? resetProfile : undefined}>
              <Button variant="brand" onClick={handleSaveProfile} disabled={!profileDirty || !firstName.trim()} loading={isSaving}>
                <Save />
                {t("saveProfile")}
              </Button>
            </FormFooter>
          </Section>
        );

      case "company":
        return (
          <div key={id} className="space-y-6">
            {companies.map(({ organization, membership }) => (
              <Section key={organization.id} id={id} title={namedCompanies ? organization.name : tp("companyDetails")} titled={titled || namedCompanies}>
                <CompanyDetails key={organization.id} organization={organization} role={membership?.role} />
              </Section>
            ))}
          </div>
        );

      case "people":
        return (
          <div key={id} className="space-y-6">
            {ownedCompanies.map(({ organization }) => (
              <Section key={organization.id} id={id} title={namedCompanies ? organization.name : tp("people")} titled={titled || namedCompanies}>
                <CompanyPeople organization={organization} viewerRepId={me?.rep.id} />
              </Section>
            ))}
          </div>
        );

      case "signin":
        return (
          <div key={id} className="space-y-8">
            <Section id={id} title={tn("tabSignIn")} titled={titled}>
              <SignInMethods />
            </Section>
          </div>
        );

      case "language":
        return (
          <Section key={id} id={id} title={tc("language")} titled={titled}>
            <p className="text-sm text-white/45">{t("languageHint")}</p>
            <LanguageList />
          </Section>
        );
    }
  };

  const sectionTitle: Record<SettingsSection, string> = {
    profile: t("sectionProfile"),
    signin: tn("tabSignIn"),
    language: tc("language"),
    company: tp("companyDetails"),
    people: tp("people"),
  };

  // Desktop: the menu beside the open item.
  if (isDesktop) {
    const open = openSection ?? "profile";
    return (
      <AppLayout title={t("title")} size="full" desktopColumnClassName="lg:px-0 lg:pb-12 lg:pt-6" topBarActions={<InstallAppHeaderButton />}>
        <div className="grid w-full grid-cols-[15rem_minmax(0,1fr)] items-start gap-8">
          <nav aria-label={t("title")} className="sticky top-24 space-y-6 px-3" data-testid="settings-menu">

            {menu.map((group) => (
              <div key={group.title}>
                <p className={`${EYEBROW} mb-2 px-3`}>{group.title}</p>
                <div className="space-y-1">
                  {group.items.map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => navigateGuarded(`/settings?tab=${id}`, setLocation)}
                      aria-current={id === open ? "page" : undefined}
                      className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${id === open ? `${ACCENT_SELECTED.account.row} text-white` : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}
                      data-testid={`settings-open-${id}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{sectionTitle[id]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="min-w-0 pr-8">{renderSection(open, true)}</div>
        </div>
      </AppLayout>
    );
  }

  // Phone, inside a section: its own screen; Back returns to the list.
  if (openSection) {
    return (
      <AppLayout title={sectionTitle[openSection]} mobileMaxWidth="max-w-lg" mobileColumnClassName="pb-20 pt-6">
        <PageHeader
          onBack={() => setLocation("/settings")}
          backLabel={tc("back")}
          eyebrow={t("title")}
          title={sectionTitle[openSection]}
          className="mb-6"
        />
        {renderSection(openSection, false)}
      </AppLayout>
    );
  }

  // Phone: the list, like a phone's own settings. Each row says where it stands.
  const rowValue: Partial<Record<SettingsSection, string>> = {
    signin: me.user.phone ? formatPhone(me.user.phone) : me.user.email ?? undefined,
    language: LANG_LABELS[lang],
    company: namedCompanies ? tp.plural("companiesCount", companies.length) : companies[0]?.organization.name,
  };

  return (
    <AppLayout title={t("title")} mobileMaxWidth="max-w-lg" mobileColumnClassName="pb-20 pt-6">
      <PageHeader
        onBack={() => setLocation(homeForModules(modules))}
        backLabel={tc("back")}
        title={t("title")}
        actions={<InstallAppHeaderButton />}
        className="mb-6"
      />

      <div className="space-y-4" data-testid="settings-list">
        <button
          type="button"
          onClick={() => setLocation("/settings?tab=profile")}
          className={`flex w-full items-center gap-4 rounded-2xl ${GLASS_CLASS} p-4 text-left transition-colors active:bg-white/[0.08]`}
          data-testid="settings-open-profile"
        >
          {me?.rep.avatarUrl ? (
            <img src={me.rep.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-[20px] border border-white/10 object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] text-lg font-bold text-white" style={{ background: BRAND_GRADIENT }}>
              {initials}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-white">{name || t("sectionProfile")}</span>
            <span className="block truncate text-sm text-white/50">{t("editProfile")}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/35" />
        </button>

        {menu.map((group) => (
          <div key={group.title}>
            <p className={`${EYEBROW} mb-2 px-1`}>{group.title}</p>
            <nav aria-label={group.title} className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS}`}>
              {group.items.filter(({ id }) => id !== "profile").map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLocation(`/settings?tab=${id}`)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[0.06]"
                  data-testid={`settings-open-${id}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">{sectionTitle[id]}</span>
                  {rowValue[id] && <span className="max-w-[45%] shrink-0 truncate text-sm text-white/45">{rowValue[id]}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                </button>
              ))}
            </nav>
          </div>
        ))}

        {academy && (
          <nav aria-label={ta("title")} className={`overflow-hidden rounded-2xl ${GLASS_CLASS}`}>
            <button
              type="button"
              onClick={() => setLocation("/academy")}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[0.06]"
              data-testid="settings-open-academy"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                <GraduationCap className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">{ta("title")}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
            </button>
          </nav>
        )}

        {otherPanels.length > 0 && (
          <div>
            <p className={`${EYEBROW} mb-2 px-1`}>{tw("panelsHeading")}</p>
            <nav aria-label={tw("switchPanel")} className={`divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${GLASS_CLASS}`} data-testid="settings-panels">
              {otherPanels.map((panel) => {
                const Icon = PANEL_ICON[panel];
                return (
                  <button
                    key={panel}
                    type="button"
                    onClick={() => panelSwitch.go(panel)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/[0.06]"
                    data-testid={`settings-panel-${panel}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">{panelSwitch.label(panel)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSigningOut(true)}
          className={`flex min-h-14 w-full items-center gap-3 rounded-2xl ${GLASS_CLASS} px-4 py-3 text-left text-[15px] font-medium text-red-300 transition-colors active:bg-red-500/10`}
          data-testid="settings-sign-out"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10"><LogOut className="h-4 w-4" /></span>
          {ts("signOut")}
        </button>
        <SignOutConfirm open={signingOut} onOpenChange={setSigningOut} />
      </div>
    </AppLayout>
  );
}
