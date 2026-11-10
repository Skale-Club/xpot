import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Building2, CalendarDays, GraduationCap, Check, ChevronRight, KeyRound, LayoutGrid, Nfc, PackageOpen, Phone, RotateCcw,
  ShieldCheck, Tag, Webhook, X, type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Pill, ROLE_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { DANGER_OUTLINE, GLASS_CLASS } from "@/components/xpot/surface";
import { formatDate } from "@/lib/format";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { blockNote } from "@shared/repAccess";
import { LANG_LABELS, translate, useT, type Lang } from "@/i18n";
import { adminUiMessages } from "@/i18n/messages/adminUi";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { settingsMessages } from "@/i18n/messages/settings";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { personStatus, type PeopleStatus } from "./peopleFilters";
import { DangerZone } from "./PersonDanger";
import { Memberships } from "./PersonOrganizations";
import { PersonTagsSales } from "./PersonTagsSales";
import { XphereConnection } from "./PersonXphere";
import { PersonAcademy } from "./PersonAcademy";
import { academyMessages } from "@/i18n/messages/academy";

// One person in Account › People (/admin/reps/:repId): every decision about
// them in one pane, by section. Access (approve, refuse, block, unblock,
// delete), role and modules, organization memberships, the Tags terms, their
// Xphere connection (the global admin's) and links to what they did. Each
// state of a person gets only what applies: a sign-up waiting or refused has
// its data, modules and the decision; a blocked account its reason and history.

export type Rep = {
  id: number;
  userId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  loginPhone: string | null;
  wholesaleCode: string | null;
  costPolicy: "zero" | "acquisition";
  costPolicyConfiguredAt: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[];
  access: "pending" | "active" | "blocked";
  /** Blocked because their sign-up was refused (shared/repAccess.ts). */
  refused: boolean;
  /** The organizations they are an active member of (a personal workspace left out), with their role in each. */
  teams: { id: number; name: string; role: "admin" | "member" }[];
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string | null;
  application: {
    email: string | null;
    workCity: string | null;
    workRegion: string | null;
    occupation: string | null;
    availability: "weekdays" | "evenings" | "weekends" | "flexible" | null;
    hasVehicle: boolean | null;
    languages: string[] | null;
    otherLanguages: string | null;
    salesExperience: "none" | "some" | "experienced" | null;
    fieldSalesReadiness: "ready" | "with_support" | "not_ready" | null;
    kitInvestmentAcknowledged: boolean | null;
    activeSellerAcknowledged: boolean | null;
    message: string | null;
    status: string;
    submittedAt: string;
  } | null;
};

export const REPS_KEY = ["/api/xpot/admin/reps"];
export const MODULE_KEYS = { visits: "moduleVisits", tags: "moduleTags" } as const satisfies Record<XpotModule, keyof typeof commonMessages.en>;
export const ROLES = ["rep", "admin"] as const;
export const ROLE_KEYS = { rep: "role_rep", admin: "role_admin" } as const satisfies Record<(typeof ROLES)[number], keyof typeof settingsMessages.en>;
/** The "Role" of old, said as what it is: whether the person administers the platform. */
export const PLATFORM_ACCESS_KEYS = { rep: "platformAccessNo", admin: "platformAccessYes" } as const satisfies Record<(typeof ROLES)[number], keyof typeof peopleWorkspaceMessages.en>;
export const STATUS_TONE: Record<PeopleStatus, PillTone> = { pending: "amber", active: "green", blocked: "red", refused: "slate" };

export async function send<T>(url: string, body: unknown = {}, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || translate(commonMessages, "requestFailed"));
  return data as T;
}

export function useRepAction(successTitle: (rep: Rep) => string, onDone?: () => void) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown; rep: Rep }) => send(url, body),
    onSuccess: (_data, { rep }) => {
      toast({ title: successTitle(rep), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      onDone?.();
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
}

export function ModuleChecks({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const tc = useT(commonMessages);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {XPOT_MODULES.map((module) => (
        <label key={module} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm ${disabled ? "text-white/35" : "cursor-pointer text-white/70 hover:bg-white/[0.04]"}`}>
          <input
            type="checkbox"
            checked={disabled || value.includes(module)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? (value.includes(module) ? value : [...value, module]) : value.filter((m) => m !== module))}
            className="h-4 w-4 accent-blue-500"
          />
          {tc(MODULE_KEYS[module])}
        </label>
      ))}
    </div>
  );
}

/** A label over a value and its actions, for the settings that are not a single control. */
export function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold text-white/60">{label}</p>
      {children}
      {hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

/**
 * Pills for who someone is: where they stand (`showStatus`, not in a list already grouped by it), their place
 * (platform administrator, or their role in their organization) and their modules. A sign-up still waiting or
 * refused has no place and no modules yet: those are chosen when it is approved.
 */
export function PersonPills({ rep, showStatus = true }: { rep: Rep; showStatus?: boolean }) {
  const undecided = isUndecided(rep);
  return (
    <>
      {showStatus && <PersonStatusPill rep={rep} />}
      {!undecided && <PersonPlacePill rep={rep} />}
      {!undecided && <PersonModules rep={rep} />}
    </>
  );
}

/** A sign-up still waiting or refused: no place and no modules yet. */
export const isUndecided = (rep: Rep) => {
  const status = personStatus(rep);
  return status === "pending" || status === "refused";
};

/** Where they stand: waiting, active, blocked or refused. */
export function PersonStatusPill({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const status = personStatus(rep);
  return <Pill tone={STATUS_TONE[status]}>{t(`status_${status}`)}</Pill>;
}

/** Platform administrator, or their role in their organization ("Owner at Skale Club", "2 organizations"). */
export function PersonPlacePill({ rep }: { rep: Rep }) {
  const tse = useT(settingsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const platform = rep.role === "admin";
  const roleKey = ROLE_KEYS[rep.role as (typeof ROLES)[number]];
  const first = rep.teams[0];
  const place = platform
    ? (roleKey ? tse(roleKey) : rep.role)
    : rep.teams.length > 1
      ? tw("personOrgCount", { count: rep.teams.length })
      : first
        ? tw("personOrgLine", { role: tw(first.role === "admin" ? "orgRoleAdmin" : "orgRoleMember"), org: first.name })
        : tw("personNoOrg");
  return <Pill tone={platform ? toneOf(ROLE_TONE, rep.role) : "slate"} className="max-w-full">{place}</Pill>;
}

/** "Visits · Tags": the modules they use. */
export function PersonModules({ rep }: { rep: Rep }) {
  const tc = useT(commonMessages);
  return <span className="text-xs text-white/45">{repModules({ role: rep.role, modules: rep.modules }).map((m) => tc(MODULE_KEYS[m])).join(" · ")}</span>;
}

export function Section({ title, icon: Icon, children, testId }: { title: string; icon: LucideIcon; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-3 border-t border-white/[0.06] pt-4" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/45">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The person, by section. `onClose` (desktop pane) adds a close button; `onGone` runs when the account is deleted. */
export function PersonDetail({ rep, onClose, onGone }: { rep: Rep; onClose?: () => void; onGone: () => void }) {
  const tc = useT(commonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const ta = useT(academyMessages);
  const t = useT(manageMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const status = personStatus(rep);
  // What applies: a sign-up waiting or refused has no modules, organizations, terms or connections yet.
  const modules = status === "pending" || status === "refused" ? [] : repModules({ role: rep.role, modules: rep.modules });
  const member = status === "active" || status === "blocked";
  return (
    <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4 sm:p-5`} data-testid={`person-${rep.id}`}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-white">{rep.displayName}</h2>
          <p className="truncate text-xs text-white/45">
            {rep.loginPhone ? formatPhone(rep.loginPhone) : <span className="text-amber-300/80">{t("noSignInPhone")}</span>}
            {rep.email ? ` · ${rep.email}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PersonPills rep={rep} />
          </div>
        </div>
        {onClose && (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={tc("close")} title={tc("close")} className="-mr-2 shrink-0 text-white/45">
            <X aria-hidden="true" />
          </Button>
        )}
      </header>

      <Section title={tw("sectionAccess")} icon={ShieldCheck} testId="person-access">
        <AccessSection key={`${rep.id}-${status}`} rep={rep} />
      </Section>

      {/* A sign-up gets its modules when approved (Access); a blocked account keeps what it had. */}
      {status === "active" && (
        <Section title={tw("sectionRole")} icon={LayoutGrid} testId="person-role">
          <RoleEditor key={rep.id} rep={rep} />
        </Section>
      )}

      {member && (
        <Section title={tw("sectionOrganizations")} icon={Building2} testId="person-orgs">
          <Memberships rep={rep} />
        </Section>
      )}

      {status === "active" && modules.includes("tags") && (
        <Section title={tw("sectionTags")} icon={Tag} testId="person-tags">
          <TagsTerms key={rep.id} rep={rep} />
          {/* What the Resellers screen used to show for them (the Tags report); a sign-up has no sales yet. */}
          <div className="mt-4 border-t border-white/[0.06] pt-4"><PersonTagsSales key={rep.id} rep={rep} /></div>
        </Section>
      )}

      {/* Xphere is set by the platform only. */}
      {isSuperAdmin && status === "active" && modules.includes("visits") && rep.userId && (
        <Section title={tw("sectionVisits")} icon={Webhook} testId="person-xphere">
          <XphereConnection key={rep.id} rep={rep} userId={rep.userId} />
        </Section>
      )}

      {/* What they watched in the Academy and for how long; the global admin's. */}
      {isSuperAdmin && status === "active" && (
        <Section title={ta("personSection")} icon={GraduationCap} testId="person-academy">
          <PersonAcademy key={rep.id} repId={rep.id} />
        </Section>
      )}

      {member && (modules.includes("tags") || modules.includes("visits")) && (
        <Section title={tw("sectionActivity")} icon={ChevronRight} testId="person-activity">
          <div className="flex flex-wrap gap-2">
            {/* The visits history narrowed to this person (management mode, ?rep=). */}
            {modules.includes("visits") && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/admin/work/dashboard/history?rep=${rep.id}`} data-testid="person-their-visits"><CalendarDays />{tw("theirVisits")}</Link>
              </Button>
            )}
            {modules.includes("tags") && (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/admin/tags/pieces?rep=${rep.id}`}><Nfc />{tw("theirPieces")}</Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/admin/tags/kits?kitRep=${rep.id}`}><PackageOpen />{tw("theirKits")}</Link>
                </Button>
              </>
            )}
          </div>
        </Section>
      )}

      <DangerZone rep={rep} onGone={onGone} />
    </div>
  );
}

// ─── Access ──────────────────────────────────────────────────────────────────

function AccessSection({ rep }: { rep: Rep }) {
  const status = personStatus(rep);
  if (status === "pending") return <PendingAccess rep={rep} />;
  if (status === "active") return <ActiveAccess rep={rep} />;
  return <BlockedAccess rep={rep} />;
}

function Application({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const a = rep.application;
  if (!a) return <p className="text-xs text-amber-200/70">{t("applicationMissing")}</p>;
  const availabilityKey = a.availability ? `applicationAvailability_${a.availability}` as const : null;
  const experienceKey = a.salesExperience ? `applicationSales_${a.salesExperience}` as const : null;
  const readinessKey = a.fieldSalesReadiness ? `applicationReadiness_${a.fieldSalesReadiness}` as const : null;
  const item = (label: string, value: ReactNode, wide = false) => (
    <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-xs text-white/35">{label}</dt><dd className="mt-0.5 break-words text-white/75">{value || "-"}</dd></div>
  );
  // The form no longer asks these; they show only on applications sent before.
  const legacy = (label: string, value: ReactNode) => (value ? item(label, value) : null);
  const languages = [...(a.languages ?? []).map((code) => LANG_LABELS[code as Lang] ?? code), a.otherLanguages].filter(Boolean).join(", ");
  return (
    <div data-testid={`application-${rep.id}`}>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {item(t("applicationEmail"), a.email, true)}
        {item(t("applicationCity"), [a.workCity, a.workRegion].filter(Boolean).join(", "))}
        {item(t("applicationVehicle"), a.hasVehicle === null ? null : a.hasVehicle ? t("applicationYes") : t("applicationNo"))}
        {legacy(t("applicationOccupation"), a.occupation)}
        {legacy(t("applicationAvailability"), availabilityKey ? t(availabilityKey) : null)}
        {legacy(t("applicationLanguages"), languages)}
        {legacy(t("applicationSalesExperience"), experienceKey ? t(experienceKey) : null)}
        {legacy(t("applicationFieldReadiness"), readinessKey ? t(readinessKey) : null)}
      </dl>
      <p className="mt-3 text-xs text-white/45">
        {a.kitInvestmentAcknowledged && a.activeSellerAcknowledged ? `✓ ${t("applicationTermsAcknowledged")}` : t("applicationTermsMissing")}
      </p>
      {a.message ? <p className="mt-3 text-sm leading-relaxed text-white/55"><span className="font-medium text-white/70">{t("applicationMessage")}:</span> {a.message}</p> : null}
    </div>
  );
}

function PendingAccess({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  const tw = useT(peopleWorkspaceMessages);
  // Nothing preselected: the module choice is made on purpose (the same as creating access).
  const [modules, setModules] = useState<string[]>([]);
  const [refusing, setRefusing] = useState(false);
  const approve = useRepAction((r) => t("repCanSignInNow", { name: r.displayName }));
  const refuse = useRepAction((r) => t("repRefused", { name: r.displayName }));
  const busy = approve.isPending || refuse.isPending;
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">{tw("accessPendingHint")}</p>
      {rep.createdAt && <p className="text-xs text-white/35">{t("signedUpOn", { date: formatDate(rep.createdAt) })}</p>}
      <Application rep={rep} />
      <Setting label={t("modules")}>
        <div className="flex flex-wrap items-center gap-2">
          <ModuleChecks value={modules} onChange={setModules} />
          {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
        </div>
      </Setting>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" className={DANGER_OUTLINE} disabled={busy} onClick={() => setRefusing(true)}>
          {t("refuse")}
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={busy || modules.length === 0}
          loading={approve.isPending}
          onClick={() => approve.mutate({ url: `/api/xpot/admin/reps/${rep.id}/approve`, body: { modules }, rep })}
          data-testid={`approve-${rep.id}`}
        >
          <Check />
          {t("approve")}
        </Button>
      </div>
      <ConfirmDialog
        open={refusing}
        onOpenChange={setRefusing}
        tone="danger"
        title={tu("refuseTitle", { name: rep.displayName })}
        description={tu("refuseBody")}
        reason="optional"
        reasonLabel={t("reasonOptional")}
        confirmLabel={t("refuse")}
        onConfirm={(reason) => refuse.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/refuse`, body: { reason: reason || null }, rep })}
      />
    </div>
  );
}

function ActiveAccess({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tu = useT(adminUiMessages);
  const tc = useT(commonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const [dialog, setDialog] = useState<"phone" | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const phone = useRepAction((r) => t("repPhoneChanged", { name: r.displayName }));
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  // Only the platform acts on platform users; anyone else on reps (the server answers 403).
  const mayManage = isSuperAdmin || rep.role === "rep";
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">{tw("accessActiveHint")}</p>
      <Setting label={t("fieldSignInPhone")} hint={t("signInPhoneHint")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/80">{rep.loginPhone ? formatPhone(rep.loginPhone) : t("noSignInPhone")}</span>
          {(mayManage || isSelf) && (
            <Button variant="secondary" size="sm" onClick={() => { setNewPhone(rep.loginPhone ?? ""); setDialog("phone"); }}>
              <Phone />
              {t("changePhone")}
            </Button>
          )}
        </div>
      </Setting>
      <ConfirmDialog
        open={dialog === "phone"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={tu("changePhoneTitle", { name: rep.displayName })}
        description={t("signInPhoneHint")}
        confirmLabel={tc("save")}
        confirmDisabled={!newPhone.trim() || newPhone.trim() === (rep.loginPhone ?? "")}
        onConfirm={() => phone.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/phone`, body: { phone: newPhone.trim() }, rep })}
      >
        <Field label={t("fieldSignInPhone")}>
          <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("phonePlaceholder")} type="tel" autoFocus />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function BlockedAccess({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const unblock = useRepAction((r) => t("repCanSignInAgain", { name: r.displayName }));
  // A refused sign-up was never blocked: the same action is an approval, worded as one.
  const approveAfterAll = rep.refused;
  const date = rep.blockedAt ? formatDate(rep.blockedAt) : "";
  const note = blockNote(rep.blockedReason);
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">{rep.refused ? tw("accessRefusedHint") : tw("accessBlockedHint")}</p>
      <p className="text-sm text-white/70">
        {(rep.refused ? t("refusedOn", { date }) : t("blockedOn", { date })).trim()}
        {note ? ` · ${note}` : ""}
      </p>
      {(isSuperAdmin || rep.role === "rep") && (
        <Button
          variant="secondary"
          size="sm"
          loading={unblock.isPending}
          onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
          data-testid={`unblock-${rep.id}`}
        >
          {approveAfterAll ? <Check /> : <RotateCcw />}
          {approveAfterAll ? tw("approveAfterAll") : t("unblock")}
        </Button>
      )}
    </div>
  );
}

// ─── Role & modules ──────────────────────────────────────────────────────────

/** The fields POST /admin/reps needs to save one change; the free-text team is left as it is. */
function profileBody(rep: Rep, patch: { role?: string; modules?: string[]; costPolicy?: "zero" | "acquisition" }) {
  return {
    userId: rep.userId,
    displayName: rep.displayName,
    email: rep.email,
    role: patch.role ?? rep.role,
    modules: patch.modules ?? rep.modules ?? [...XPOT_MODULES],
    ...(patch.costPolicy ? { costPolicy: patch.costPolicy } : {}),
  };
}

function RoleEditor({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [role, setRole] = useState(rep.role);
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  // Only the platform acts on platform users; anyone else on reps (the server answers 403).
  const canEdit = isSuperAdmin || rep.role === "rep";
  // Your own role is locked (you'd sign yourself out), and only the global admin changes roles at all.
  const roleLocked = isSelf || !isSuperAdmin;
  const isPlatform = role === "admin";
  const sameModules = [...modules].sort().join() === [...(rep.modules ?? XPOT_MODULES)].sort().join();
  const dirty = role !== rep.role || !sameModules;
  // The "admin" role is the global Xpot admin (storage.updateSalesRepAccountProfile): changing it signs them out.
  const adminChanges = (role === "admin") !== (rep.role === "admin");
  const reset = () => {
    setRole(rep.role);
    setModules(rep.modules ?? [...XPOT_MODULES]);
  };

  const save = useMutation({
    mutationFn: () => send("/api/xpot/admin/reps", profileBody(rep, { role, modules })),
    onSuccess: () => {
      setConfirmAdmin(false);
      toast({ title: t("repUpdated", { name: rep.displayName }), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => {
      setConfirmAdmin(false);
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    },
  });

  if (!canEdit) {
    const roleKey = ROLE_KEYS[rep.role as (typeof ROLES)[number]];
    return <p className="text-sm text-white/70">{roleKey ? tse(roleKey) : rep.role} · <span className="text-xs text-white/45">{t("platformUsesAllModules")}</span></p>;
  }

  return (
    <div className="space-y-4" data-testid={`rep-editor-${rep.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Field label={tw("platformAccess")} hint={isSelf ? t("ownRoleLocked") : !isSuperAdmin ? t("roleAdminOnly") : undefined}>
            <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={roleLocked} data-testid={`role-${rep.id}`}
              options={ROLES.map((r) => ({ value: r, label: tw(PLATFORM_ACCESS_KEYS[r]) }))} />
          </Field>
          {adminChanges && (
            <div data-testid={`admin-warning-${rep.id}`}>
              <InlineAlert tone="warning">{role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}</InlineAlert>
            </div>
          )}
        </div>
        <Setting label={t("modules")} hint={isPlatform ? t("platformUsesAllModules") : undefined}>
          <ModuleChecks value={modules} onChange={setModules} disabled={isPlatform} />
        </Setting>
      </div>
      <FormFooter dirty={dirty} onCancel={dirty ? reset : undefined}>
        <Button
          variant="brand"
          onClick={() => (adminChanges ? setConfirmAdmin(true) : save.mutate())}
          disabled={!dirty || modules.length === 0}
          loading={save.isPending}
          data-testid={`save-${rep.id}`}
        >
          {tc("save")}
        </Button>
      </FormFooter>
      <ConfirmDialog
        open={confirmAdmin}
        onOpenChange={setConfirmAdmin}
        title={role === "admin" ? t("confirmAdminTitle", { name: rep.displayName }) : t("confirmAdminRemoveTitle", { name: rep.displayName })}
        description={role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}
        confirmLabel={t("confirmAdminAction")}
        destructive={role !== "admin"}
        busy={save.isPending}
        onConfirm={() => save.mutate()}
        testId={`confirm-admin-${rep.id}`}
      />
    </div>
  );
}

// ─── Tags ────────────────────────────────────────────────────────────────────

function TagsTerms({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const isSuperAdmin = useIsSuperAdmin();
  // Never configured: "Not set" until someone picks a rule on purpose (saving no longer picks one for them).
  const initial = rep.costPolicyConfiguredAt ? rep.costPolicy ?? "acquisition" : "";
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">(initial);
  const [confirmCode, setConfirmCode] = useState(false);
  const newCode = useRepAction((r) => t("repNewCode", { name: r.displayName }));
  const canEdit = isSuperAdmin || rep.role === "rep";
  const dirty = costPolicy !== "" && costPolicy !== initial;
  const save = useMutation({
    mutationFn: () => send("/api/xpot/admin/reps", profileBody(rep, { costPolicy: costPolicy || undefined })),
    onSuccess: () => {
      toast({ title: t("repUpdated", { name: rep.displayName }), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  const issueCode = () => newCode.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/wholesale-code`, rep });

  return (
    <div className="space-y-4">
      <Field label={t("costPolicyTitle")} hint={t("costPolicyHint")}>
        <Select value={costPolicy} onChange={(e) => setCostPolicy(e.target.value as "zero" | "acquisition")} disabled={!canEdit} data-testid={`cost-policy-${rep.id}`}>
          {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
          <option value="zero">{t("costPolicyZero")}</option>
          <option value="acquisition">{t("costPolicyAcquisition")}</option>
        </Select>
      </Field>
      {canEdit && dirty && (
        <FormFooter dirty={dirty} onCancel={() => setCostPolicy(initial)}>
          <Button variant="brand" size="sm" onClick={() => save.mutate()} loading={save.isPending} data-testid={`save-cost-${rep.id}`}>
            {tc("save")}
          </Button>
        </FormFooter>
      )}
      {/* The wholesale code buys Tags kits: only for an approved person (the server refuses the rest). */}
      {rep.access === "active" && (
        <Setting label={t("fieldWholesale")} hint={t("wholesaleHint")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm ${rep.wholesaleCode ? "font-mono text-white/80" : "text-white/40"}`}>{rep.wholesaleCode ?? t("wholesaleNone")}</span>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                loading={!rep.wholesaleCode && newCode.isPending}
                // Replacing a code cancels the old one, so that asks first; the first one doesn't.
                onClick={() => (rep.wholesaleCode ? setConfirmCode(true) : void issueCode().catch(() => undefined))}
                data-testid={`wholesale-${rep.id}`}
              >
                <KeyRound />
                {rep.wholesaleCode ? t("wholesaleReissue") : t("wholesaleIssue")}
              </Button>
            )}
          </div>
        </Setting>
      )}
      <ConfirmDialog
        open={confirmCode}
        onOpenChange={setConfirmCode}
        title={t("wholesaleReissue")}
        description={t("wholesaleConfirm", { name: rep.displayName, code: rep.wholesaleCode ?? "" })}
        confirmLabel={t("wholesaleReissue")}
        onConfirm={issueCode}
        testId={`wholesale-${rep.id}-confirm`}
      />
    </div>
  );
}

