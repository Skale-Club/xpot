import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Ban, Building2, CalendarDays, Check, ChevronRight, Eye, EyeOff, KeyRound, LayoutGrid, Nfc, PackageOpen, Phone, RotateCcw, RotateCw,
  ShieldCheck, Tag, Trash2, Webhook, X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdminBadge, useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { CopyButton } from "@/components/xpot/CopyButton";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { INTEGRATION_TONE, Pill, ROLE_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { DANGER_OUTLINE, GLASS_CLASS } from "@/components/xpot/surface";
import { formatDate, formatDateTime } from "@/lib/format";
import { XPOT_MODULES, repModules, type XpotModule } from "@shared/modules";
import { formatPhone } from "@shared/phone";
import { blockNote } from "@shared/repAccess";
import { translate, useT } from "@/i18n";
import { adminUiMessages } from "@/i18n/messages/adminUi";
import { commonMessages } from "@/i18n/messages/common";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { manageMessages, type ManageKey } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { settingsMessages } from "@/i18n/messages/settings";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { isXphereQueryKey, maskInboundKey } from "./integrationsUi";
import { SERVICES_KEY } from "./platform/servicesUi";
import { personStatus, type PeopleStatus } from "./peopleFilters";

// One person in Account › People (/admin/reps/:repId): every decision about
// them in one pane, by section. Access (approve, refuse, block, unblock,
// delete), role and modules, organization memberships, the Tags terms, their
// Xphere connection (the global admin's) and links to what they did.

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
export const ROLES = ["rep", "manager", "admin"] as const;
export const ROLE_KEYS = { rep: "role_rep", manager: "role_manager", admin: "role_admin" } as const satisfies Record<(typeof ROLES)[number], keyof typeof settingsMessages.en>;
export const STATUS_TONE: Record<PeopleStatus, PillTone> = { pending: "amber", active: "green", blocked: "red", refused: "slate" };
const SYNC_STATUS_TONE: Record<string, PillTone> = { synced: "green", pending: "slate", needs_review: "amber", failed: "red" };
const SYNC_STATUS_KEYS: Record<string, ManageKey> = {
  pending: "syncStatus_pending",
  synced: "syncStatus_synced",
  failed: "syncStatus_failed",
  needs_review: "syncStatus_needs_review",
};

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

/** Pills for where someone stands, their role and their modules; used by the list rows too. */
export function PersonPills({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const status = personStatus(rep);
  const roleKey = ROLE_KEYS[rep.role as (typeof ROLES)[number]];
  return (
    <>
      <Pill tone={STATUS_TONE[status]}>{t(`status_${status}`)}</Pill>
      <Pill tone={toneOf(ROLE_TONE, rep.role)}>{roleKey ? tse(roleKey) : rep.role}</Pill>
      <span className="text-xs text-white/45">{repModules({ role: rep.role, modules: rep.modules }).map((m) => tc(MODULE_KEYS[m])).join(" · ")}</span>
    </>
  );
}

function Section({ title, icon: Icon, children, testId }: { title: string; icon: typeof Ban; children: ReactNode; testId?: string }) {
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
  const t = useT(manageMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const modules = repModules({ role: rep.role, modules: rep.modules });
  const status = personStatus(rep);
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
        <AccessSection key={`${rep.id}-${status}`} rep={rep} onGone={onGone} />
      </Section>

      {/* A sign-up gets its modules when approved (Access); a blocked account keeps what it had. */}
      {status === "active" && (
        <Section title={tw("sectionRole")} icon={LayoutGrid} testId="person-role">
          <RoleEditor key={rep.id} rep={rep} />
        </Section>
      )}

      <Section title={tw("sectionOrganizations")} icon={Building2} testId="person-orgs">
        <Memberships rep={rep} />
      </Section>

      {modules.includes("tags") && (
        <Section title={tw("sectionTags")} icon={Tag} testId="person-tags">
          <TagsTerms key={rep.id} rep={rep} />
        </Section>
      )}

      {/* Xphere is set by the global admin only (the API answers 403 to managers). */}
      {isSuperAdmin && modules.includes("visits") && rep.userId && (
        <Section title={tw("sectionVisits")} icon={Webhook} testId="person-xphere">
          <XphereConnection key={rep.id} rep={rep} userId={rep.userId} />
        </Section>
      )}

      {(modules.includes("tags") || modules.includes("visits")) && (
        <Section title={tw("sectionActivity")} icon={ChevronRight} testId="person-activity">
          <div className="flex flex-wrap gap-2">
            {/* The visits history narrowed to this person (management mode, ?rep=). */}
            {modules.includes("visits") && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/history?rep=${rep.id}`} data-testid="person-their-visits"><CalendarDays />{tw("theirVisits")}</Link>
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
    </div>
  );
}

// ─── Access ──────────────────────────────────────────────────────────────────

function AccessSection({ rep, onGone }: { rep: Rep; onGone: () => void }) {
  const status = personStatus(rep);
  if (status === "pending") return <PendingAccess rep={rep} />;
  if (status === "active") return <ActiveAccess rep={rep} />;
  return <BlockedAccess rep={rep} onGone={onGone} />;
}

function Application({ rep }: { rep: Rep }) {
  const t = useT(manageMessages);
  const a = rep.application;
  if (!a) return <p className="text-xs text-amber-200/70">{t("applicationMissing")}</p>;
  const availabilityKey = a.availability ? `applicationAvailability_${a.availability}` as const : null;
  const experienceKey = a.salesExperience ? `applicationSales_${a.salesExperience}` as const : null;
  const readinessKey = a.fieldSalesReadiness ? `applicationReadiness_${a.fieldSalesReadiness}` as const : null;
  const item = (label: string, value: ReactNode) => (
    <div><dt className="text-xs text-white/35">{label}</dt><dd className="mt-0.5 break-words text-white/75">{value || "—"}</dd></div>
  );
  // The form no longer asks these; they show only on applications sent before.
  const legacy = (label: string, value: ReactNode) => (value ? item(label, value) : null);
  const languages = [...(a.languages ?? []), a.otherLanguages].filter(Boolean).join(", ");
  return (
    <div data-testid={`application-${rep.id}`}>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {item(t("applicationEmail"), a.email)}
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
  const [dialog, setDialog] = useState<"block" | "phone" | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const block = useRepAction((r) => t("repBlocked", { name: r.displayName }));
  const phone = useRepAction((r) => t("repPhoneChanged", { name: r.displayName }));
  // Blocking yourself would lock you out of the admin you are using.
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  // A manager may only act on reps (the server answers 403 for managers and admins).
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
      {mayManage && !isSelf && (
        <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => setDialog("block")} data-testid={`block-${rep.id}`}>
          <Ban />
          {t("blockTitle")}
        </Button>
      )}
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={(o) => !o && setDialog(null)}
        tone="danger"
        title={t("confirmBlock", { name: rep.displayName })}
        description={t("blockHint")}
        reason="optional"
        reasonLabel={t("reasonOptional")}
        confirmLabel={t("block")}
        onConfirm={(reason) => block.mutateAsync({ url: `/api/xpot/admin/reps/${rep.id}/block`, body: { reason: reason || null }, rep })}
        testId={`block-${rep.id}-confirm`}
      />
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

function BlockedAccess({ rep, onGone }: { rep: Rep; onGone: () => void }) {
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const isSuperAdmin = useIsSuperAdmin();
  const unblock = useRepAction((r) => t("repCanSignInAgain", { name: r.displayName }));
  const date = rep.blockedAt ? formatDate(rep.blockedAt) : "";
  const note = blockNote(rep.blockedReason);
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">{rep.refused ? tw("accessRefusedHint") : tw("accessBlockedHint")}</p>
      <p className="text-sm text-white/70">
        {(rep.refused ? t("refusedOn", { date }) : t("blockedOn", { date })).trim()}
        {note ? ` · ${note}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {(isSuperAdmin || rep.role === "rep") && (
          <Button
            variant="secondary"
            size="sm"
            loading={unblock.isPending}
            onClick={() => unblock.mutate({ url: `/api/xpot/admin/reps/${rep.id}/unblock`, rep })}
            data-testid={`unblock-${rep.id}`}
          >
            <RotateCcw />
            {t("unblock")}
          </Button>
        )}
        <DeleteAccountButton rep={rep} onGone={onGone} />
      </div>
    </div>
  );
}

type DeletionResult = { account: "deleted" | "anonymized"; leadsDeleted: number; leadsUnassigned: number; visitsDeleted: number; files: { deleted: number; failed: number } };

/** Delete the account and its data, when the person asks (privacy policy, "How long we keep it"). */
function DeleteAccountButton({ rep, onGone }: { rep: Rep; onGone: () => void }) {
  const t = useT(manageMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const word = t("deleteAccountWord");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    // The API's own guard word is always "DELETE"; the one typed is localized.
    mutationFn: () => send<DeletionResult>(`/api/xpot/admin/reps/${rep.id}`, { confirm: "DELETE" }, "DELETE"),
    onSuccess: (r) => {
      setOpen(false);
      toast({
        title: t("accountDeleted", { name: rep.displayName }),
        description: [
          t("accountDeletedSummary", { leads: r.leadsDeleted, visits: r.visitsDeleted, files: r.files.deleted }),
          r.leadsUnassigned ? t("accountDeletedKept", { count: r.leadsUnassigned }) : "",
          r.files.failed ? t("accountDeletedFilesFailed", { count: r.files.failed }) : "",
        ].filter(Boolean).join(" "),
        variant: r.files.failed ? "destructive" : "success",
      });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      onGone();
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  // The global admin only, like the server (requireSuperAdmin), so it carries the "Admin" tag.
  if (!isSuperAdmin) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={DANGER_OUTLINE}
        loading={remove.isPending}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        data-testid={`delete-${rep.id}`}
      >
        <Trash2 />
        {t("deleteAccount")}
        <AdminBadge />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteAccountTitle", { name: rep.displayName })}
        description={t("deleteAccountBody")}
        confirmLabel={t("deleteAccount")}
        destructive
        busy={remove.isPending}
        // The word is typed in the admin's language and in capitals, like the hint says.
        confirmDisabled={typed.trim() !== word}
        onConfirm={() => remove.mutate()}
        testId={`delete-dialog-${rep.id}`}
      >
        <Field label={t("deleteAccountTypeHint", { word })}>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} autoComplete="off" data-testid={`delete-word-${rep.id}`} />
        </Field>
      </ConfirmDialog>
    </>
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
  const tc = useT(commonMessages);
  const tse = useT(settingsMessages);
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [role, setRole] = useState(rep.role);
  const [modules, setModules] = useState<string[]>(rep.modules ?? [...XPOT_MODULES]);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const isSelf = !!me && rep.id === me.rep.id;
  // A manager may only act on reps (the server answers 403 for managers and admins).
  const canEdit = isSuperAdmin || rep.role === "rep";
  // Your own role is locked (you'd sign yourself out), and only the global admin changes roles at all.
  const roleLocked = isSelf || !isSuperAdmin;
  const isManager = role === "manager" || role === "admin";
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
    return <p className="text-sm text-white/70">{roleKey ? tse(roleKey) : rep.role} · <span className="text-xs text-white/45">{t("managersUseAllModules")}</span></p>;
  }

  return (
    <div className="space-y-4" data-testid={`rep-editor-${rep.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Field label={t("fieldRole")} hint={isSelf ? t("ownRoleLocked") : !isSuperAdmin ? t("roleAdminOnly") : undefined}>
            <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={roleLocked} data-testid={`role-${rep.id}`}
              options={ROLES.map((r) => ({ value: r, label: tse(ROLE_KEYS[r]) }))} />
          </Field>
          {adminChanges && (
            <div data-testid={`admin-warning-${rep.id}`}>
              <InlineAlert tone="warning">{role === "admin" ? t("adminRoleWarning") : t("adminRoleRemovedWarning")}</InlineAlert>
            </div>
          )}
        </div>
        <Setting label={t("modules")} hint={isManager ? t("managersUseAllModules") : undefined}>
          <ModuleChecks value={modules} onChange={setModules} disabled={isManager} />
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

// ─── Organizations ───────────────────────────────────────────────────────────

type Membership = {
  organizationId: number;
  name: string;
  personal: boolean;
  organizationActive: boolean;
  role: "admin" | "member";
  isActive: boolean;
  blockedAt: string | null;
};
type OrganizationOption = { id: number; name: string; personal: boolean };

function Memberships({ rep }: { rep: Rep }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(manageMessages);
  const tw = useT(peopleWorkspaceMessages);
  const key = [`/api/xpot/admin/reps/${rep.id}/organizations`];
  const memberships = useQuery<Membership[]>({ queryKey: key });
  const organizations = useQuery<OrganizationOption[]>({ queryKey: ["/api/xpot/organizations"] });
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [removing, setRemoving] = useState<Membership | null>(null);

  const refresh = (organizationId: number) => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
    void queryClient.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organizationId}`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organizationId}/members`] });
  };
  const add = useMutation({
    mutationFn: (organizationId: number) => send(`/api/xpot/organizations/${organizationId}/members`, { repId: rep.id, membershipRole: role }),
    onSuccess: (_d, organizationId) => {
      const org = organizations.data?.find((o) => o.id === organizationId);
      toast({ title: tw("addedToOrg", { name: rep.displayName, org: org?.name ?? "" }), variant: "success" });
      setOrgId("");
      setRole("member");
      refresh(organizationId);
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (m: Membership) => send(`/api/xpot/organizations/${m.organizationId}/members/${rep.id}`, {}, "DELETE"),
    onSuccess: (_d, m) => {
      setRemoving(null);
      toast({ title: tw("removedFromOrg", { name: rep.displayName, org: m.name }), variant: "success" });
      refresh(m.organizationId);
    },
    onError: (e: Error) => {
      setRemoving(null);
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    },
  });

  if (memberships.isLoading) return <ListSkeleton rows={2} rowClassName="h-11 rounded-xl" />;
  if (memberships.isError || !memberships.data) {
    return <ErrorState compact message={tw("orgsLoadFailed")} onRetry={() => void memberships.refetch()} />;
  }
  const joined = new Set(memberships.data.map((m) => m.organizationId));
  // Other people's personal workspaces are not somewhere to add someone.
  const options = (organizations.data ?? []).filter((o) => !joined.has(o.id) && !o.personal);
  const activeCount = memberships.data.filter((m) => m.isActive && !m.blockedAt).length;
  const suspended = (m: Membership) => !m.isActive || !!m.blockedAt;

  return (
    <div className="space-y-3">
      {memberships.data.length === 0 ? (
        <p className="text-xs text-white/45">{tw("noOrganizations")}</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07]">
          {memberships.data.map((m) => (
            <li key={m.organizationId} className="flex items-center gap-2 px-3 py-2">
              {/* The name on its own line, the pills under it: a long name never squeezes out. */}
              <div className="min-w-0 flex-1">
                <Link href={`/organizations/${m.organizationId}`} className="flex min-h-9 min-w-0 items-center gap-1 text-sm font-medium text-white hover:text-blue-200" aria-label={tw("openOrganization", { name: m.name })}>
                  <span className="truncate">{m.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true" />
                </Link>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  <Pill tone={m.role === "admin" ? "blue" : "slate"}>{m.role === "admin" ? tw("orgRoleAdmin") : tw("orgRoleMember")}</Pill>
                  {m.personal && <Pill tone="slate">{tw("personalWorkspace")}</Pill>}
                  {suspended(m) && <Pill tone="red">{tw("orgSuspended")}</Pill>}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="text-red-300/80 hover:text-red-200" onClick={() => setRemoving(m)} aria-label={tw("removeFromOrg")} title={tw("removeFromOrg")} data-testid={`remove-org-${m.organizationId}`}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {options.length > 0 ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label={tw("addToOrganization")} placeholder={tw("chooseOrganization")}
              options={options.map((o) => ({ value: String(o.id), label: o.name }))} data-testid="person-add-org" />
            <Select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} aria-label={tw("orgRole")}
              options={[{ value: "member", label: tw("orgRoleMember") }, { value: "admin", label: tw("orgRoleAdmin") }]} />
            <Button variant="secondary" disabled={!orgId} loading={add.isPending} onClick={() => add.mutate(Number(orgId))}>
              {tw("add")}
            </Button>
          </div>
          {role === "admin" && <p className="text-xs text-white/45">{tw("orgAdminWarning")}</p>}
        </div>
      ) : organizations.data ? (
        <p className="text-xs text-white/40">{tw("allOrgsJoined")}</p>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={tw("removeFromOrgTitle", { name: rep.displayName, org: removing?.name ?? "" })}
        description={tw("removeFromOrgBody")}
        confirmLabel={tw("removeFromOrg")}
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        testId="person-remove-org-confirm"
      >
        {removing && !suspended(removing) && activeCount === 1 && <InlineAlert tone="warning">{tw("removeOnlyOrgWarning")}</InlineAlert>}
      </ConfirmDialog>
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

// ─── Visits: Xphere ──────────────────────────────────────────────────────────

type XphereDetail = {
  userId: string;
  repId: number;
  inboundApiKey: string | null;
  apiUrl: string;
  apiKeySet: boolean;
  isEnabled: boolean;
  lastSync: { status: string; at: string | null; error: string | null } | null;
};

function XphereConnection({ rep, userId }: { rep: Rep; userId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(integrationsMessages);
  const tm = useT(manageMessages);
  const tc = useT(commonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const key = [`/api/xpot/admin/xphere/${userId}`];
  const query = useQuery<XphereDetail>({ queryKey: key });
  const [token, setToken] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  // This person's connection and the Integrations › Xphere list.
  const refresh = () => void queryClient.invalidateQueries({ predicate: (q) => isXphereQueryKey(q.queryKey) });
  const fail = (e: Error) => toast({ title: tm("errorSaving"), description: e.message, variant: "destructive" });

  const put = useMutation({
    mutationFn: (body: { apiKey?: string; isEnabled?: boolean }) => send(`/api/xpot/admin/xphere/${userId}`, body, "PUT"),
    onSuccess: (_d, body) => {
      if (body.isEnabled !== undefined) toast({ title: tw(body.isEnabled ? "syncOnSaved" : "syncOffSaved", { name: rep.displayName }), variant: "success" });
      else toast({ title: t("xphereSavedFor", { name: rep.displayName }), variant: "success" });
      setToken("");
      refresh();
      // Integrations › Services and Status count who is connected.
      void queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY] });
    },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: () => send(`/api/xpot/admin/xphere/${userId}/rotate-inbound-key`),
    onSuccess: () => {
      setRotating(false);
      setRevealed(true);
      toast({ title: t("keyRotated", { name: rep.displayName }), variant: "success" });
      refresh();
    },
    onError: (e: Error) => {
      setRotating(false);
      fail(e);
    },
  });

  if (query.isLoading) return <ListSkeleton rows={2} rowClassName="h-11 rounded-xl" />;
  if (query.isError || !query.data) return <ErrorState compact message={tw("xphereLoadFailed")} onRetry={() => void query.refetch()} />;
  const x = query.data;
  const tokenTone = INTEGRATION_TONE[x.apiKeySet ? (x.isEnabled ? "live" : "idle") : "off"];
  const sync = x.lastSync;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pill tone={tokenTone}>{x.apiKeySet ? t("tokenSaved") : t("noToken")}</Pill>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-white/70">
          {t("xphereEnabled")}
          <Switch checked={x.isEnabled} disabled={put.isPending} onCheckedChange={(on) => put.mutate({ isEnabled: on })} data-testid="person-xphere-enabled" />
        </label>
      </div>

      <Setting label={t("inboundKey")}>
        {x.inboundApiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 font-mono text-xs text-white/75" data-testid="person-xphere-key">
              {revealed ? x.inboundApiKey : maskInboundKey(x.inboundApiKey)}
            </code>
            <Button variant="secondary" size="icon" onClick={() => setRevealed((v) => !v)} aria-label={revealed ? t("hideKey") : t("revealKey")} title={revealed ? t("hideKey") : t("revealKey")}>
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={x.inboundApiKey} label={t("copyKey")} iconOnly />
            <Button variant="secondary" size="sm" onClick={() => setRotating(true)} loading={rotate.isPending}>
              <RotateCw />
              {t("rotateKey")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-white/40">{t("noInboundKeyYet")}</p>
        )}
      </Setting>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={t("outboundToken")} className="min-w-0 flex-1">
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={x.apiKeySet ? t("keepCurrentToken") : "xph_..."} />
        </Field>
        <Button variant="brand" disabled={!token.trim()} loading={put.isPending && !!token} onClick={() => put.mutate({ apiKey: token.trim() })}>
          {tc("save")}
        </Button>
      </div>

      <Setting label={tw("lastSync")}>
        {sync ? (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm text-white/70">
              <Pill tone={toneOf(SYNC_STATUS_TONE, sync.status, "amber")}>{SYNC_STATUS_KEYS[sync.status] ? tm(SYNC_STATUS_KEYS[sync.status]) : sync.status}</Pill>
              {sync.at ? formatDateTime(sync.at) : null}
            </p>
            {sync.error && <p className="break-words text-xs text-red-300">{sync.error}</p>}
          </div>
        ) : (
          <p className="text-xs text-white/40">{tw("noSyncYet")}</p>
        )}
      </Setting>

      <Link href="/admin/integrations/xphere" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200">
        {tw("allConnections")}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={t("rotateTitle", { name: rep.displayName })}
        description={t("rotateBody")}
        confirmLabel={t("rotateKey")}
        destructive
        busy={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </div>
  );
}
