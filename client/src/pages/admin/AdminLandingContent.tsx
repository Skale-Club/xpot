import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Plus, Save, Trash2 } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { formatDate } from "@/lib/dates";
import { defaultLandingContent } from "@/lib/landingContent";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { LANG_LABELS, LANGS, useI18n, useT, type Lang } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { landingAdminMessages } from "@/i18n/messages/landingAdmin";
import { useToast } from "@/hooks/use-toast";
import type { LandingContentResponse, LandingPageContent } from "@shared/landingContent";
import { landingField, landingFieldLabel, type LandingSection } from "./landingFields";

const INPUT = "w-full rounded-xl border border-white/10 bg-[#080d19] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-blue-500/60";
const TEXTAREA = `${INPUT} min-h-24 resize-y leading-relaxed`;

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const Control = multiline ? "textarea" : "input";
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</span>
      <Control value={value} onChange={(event) => onChange(event.target.value)} className={multiline ? TEXTAREA : INPUT} />
    </label>
  );
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-white/10 bg-white/[0.025]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-white/85 marker:content-none">
        {title}
        <span className="text-lg font-light text-white/35 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="grid gap-4 border-t border-white/[0.07] p-5 sm:grid-cols-2">{children}</div>
    </details>
  );
}

const MULTILINE = new Set(["account.welcomeSub", "hero.body", "hero.accessNote", "mockup.quote", "audience.subtitle", "how.subtitle", "faq.subtitle", "cta.body"]);
const isMultiline = (path: string) => MULTILINE.has(path) || /^(audience\.cards\.\d+\.body|faq\.items\.\d+\.answer)$/.test(path);

/** Reads and writes one field by its path ("faq.items.2.answer"). */
function getAt(content: LandingPageContent, path: string): string {
  return path.split(".").reduce<any>((node, key) => node?.[key], content) ?? "";
}
function setAt(content: LandingPageContent, path: string, value: string) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce<any>((node, key) => node[key], content);
  parent[last] = value;
}

function Editor({ rows }: { rows: LandingContentResponse[] }) {
  const { lang: interfaceLang } = useI18n();
  const t = useT(landingAdminMessages);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initial = useMemo(() => Object.fromEntries(LANGS.map((locale) => {
    const saved = rows.find((row) => row.locale === locale)?.content;
    return [locale, saved ?? defaultLandingContent(locale)];
  })) as Record<Lang, LandingPageContent>, [rows]);
  // When each language was last published; null = never, the page shows the built-in text.
  const [publishedAt, setPublishedAt] = useState<Record<Lang, string | null>>(() =>
    Object.fromEntries(LANGS.map((locale) => {
      const row = rows.find((r) => r.locale === locale);
      return [locale, row?.content ? row.updatedAt : null];
    })) as Record<Lang, string | null>);
  const [locale, setLocale] = useState<Lang>(interfaceLang);
  const [drafts, setDrafts] = useState(initial);
  const [dirty, setDirty] = useState<Record<Lang, boolean>>({ en: false, pt: false, es: false });
  const content = drafts[locale];
  const anyDirty = LANGS.some((l) => dirty[l]);
  const guard = useUnsavedChangesGuard(anyDirty);

  const change = (mutate: (next: LandingPageContent) => void) => {
    const next = structuredClone(content);
    mutate(next);
    setDrafts((current) => ({ ...current, [locale]: next }));
    setDirty((current) => ({ ...current, [locale]: true }));
  };

  const save = useMutation({
    mutationFn: async (payload: { locale: Lang; content: LandingPageContent }) => (await apiRequest("PUT", `/api/xpot/admin/landing-content/${payload.locale}`, payload.content)).json() as Promise<LandingContentResponse>,
    onSuccess: async (saved) => {
      if (saved.content) setDrafts((current) => ({ ...current, [saved.locale]: saved.content! }));
      setDirty((current) => ({ ...current, [saved.locale]: false }));
      setPublishedAt((current) => ({ ...current, [saved.locale]: saved.updatedAt ?? new Date().toISOString() }));
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/landing-content"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/landing", saved.locale] });
      toast({ title: t("published"), variant: "success" });
    },
    // The server names the refused field ("faq.items.2.answer"); say which one, in words.
    onError: (error: Error) => toast({ title: t("publishFailed"), description: describeApiError(error, (path) => landingFieldLabel(path, t)), variant: "destructive" }),
  });

  const path = locale === "en" ? "/" : `/${locale}`;
  /** A text field for one path, labelled from landingFields.ts. */
  const field = (fieldPath: string) => (
    <Field
      key={fieldPath}
      label={landingField(fieldPath, t)?.field ?? fieldPath}
      value={getAt(content, fieldPath)}
      multiline={isMultiline(fieldPath)}
      onChange={(value) => change((next) => setAt(next, fieldPath, value))}
    />
  );
  const sectionTitle = (section: LandingSection) => t(`section_${section}`);
  const status = dirty[locale]
    ? { text: t("unsaved"), tone: "text-amber-300" }
    : publishedAt[locale]
      ? { text: t("publishedOn", { date: formatDate(publishedAt[locale]) }), tone: "text-emerald-300/70" }
      : { text: t("usingDefault"), tone: "text-white/45" };

  return (
    // Bottom padding so the floating Publish button never covers the last fields.
    <div className="space-y-5 pb-24" data-testid="admin-landing-content">
      <div className="flex flex-col gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"><FileText className="h-5 w-5 text-blue-300" /></div>
          <div><p className="text-sm font-semibold text-white">{t("title")}</p><p className="mt-1 text-xs leading-relaxed text-white/45">{t("intro")}</p></div>
        </div>
        <a href={path} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" />{t("openPage")}
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {LANGS.map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className={`relative rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${locale === item ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"}`}>{LANG_LABELS[item]}{dirty[item] && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />}</button>)}
        </div>
        <span className={`text-xs ${status.tone}`} data-testid="landing-status">{status.text}</span>
      </div>

      <div className="space-y-3">
        <Section title={sectionTitle("navigation")} open>
          {["navigation.audience", "navigation.how", "navigation.faq", "account.signIn", "account.dashboard", "account.welcomeTitle", "account.welcomeSub", "account.primaryCta", "account.authenticatedCta", "account.agreementBefore", "account.agreementAnd", "account.agreementAfter"].map(field)}
        </Section>

        <Section title={sectionTitle("hero")}>
          {["hero.badge", "hero.titleLine1", "hero.titleLine2", "hero.body", "hero.secondaryCta", "hero.accessNote"].map(field)}
          {Object.keys(content.mockup).map((key) => field(`mockup.${key}`))}
        </Section>

        <Section title={sectionTitle("audience")}>
          {field("audience.title")}
          {field("audience.subtitle")}
          {content.audience.cards.map((_card, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {field(`audience.cards.${index}.title`)}
                {field(`audience.cards.${index}.imageUrl`)}
                <div className="sm:col-span-2">{field(`audience.cards.${index}.body`)}</div>
              </div>
            </div>
          ))}
        </Section>

        <Section title={sectionTitle("how")}>
          {field("how.title")}
          {field("how.subtitle")}
        </Section>

        <Section title={sectionTitle("tools")}>
          {content.tools.cards.map((card, cardIndex) => (
            <div key={cardIndex} className="space-y-3 rounded-xl border border-white/[0.07] p-4">
              {field(`tools.cards.${cardIndex}.title`)}
              {card.items.map((_item, itemIndex) => field(`tools.cards.${cardIndex}.items.${itemIndex}`))}
            </div>
          ))}
        </Section>

        <Section title={sectionTitle("faq")}>
          {field("faq.title")}
          {field("faq.subtitle")}
          <div className="space-y-3 sm:col-span-2">
            {content.faq.items.map((item, index) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  {field(`faq.items.${index}.question`)}
                  {field(`faq.items.${index}.answer`)}
                </div>
                <button
                  type="button"
                  disabled={content.faq.items.length === 1}
                  onClick={() => change((n) => { n.faq.items.splice(index, 1); })}
                  className="self-start rounded-lg p-2 text-white/35 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-20"
                  title={t("removeFaq", { number: index + 1 })}
                  aria-label={t("removeFaq", { number: index + 1 })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {content.faq.items.length < 12 && (
              <button
                type="button"
                // The new entry starts in the language being edited, not the admin's.
                onClick={() => change((n) => { n.faq.items.push({ id: `faq-${Date.now()}`, question: landingAdminMessages[locale].newFaqQuestion, answer: landingAdminMessages[locale].newFaqAnswer }); })}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-xs font-semibold text-white/55 hover:border-blue-400/40 hover:text-blue-300"
              >
                <Plus className="h-4 w-4" />{t("addFaq")}
              </button>
            )}
          </div>
        </Section>

        <Section title={sectionTitle("cta")}>
          {["cta.title", "cta.body", "cta.button"].map(field)}
        </Section>

        <Section title={sectionTitle("footer")}>
          {["footer.tagline", "footer.privacyLabel", "footer.termsLabel", "footer.rights"].map(field)}
        </Section>
      </div>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button type="button" disabled={!dirty[locale] || save.isPending} onClick={() => save.mutate({ locale, content })} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-45" data-testid="landing-publish">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t("publish", { language: LANG_LABELS[locale] })}
        </button>
      </div>

      <ConfirmDialog
        open={!!guard.pendingHref}
        onOpenChange={(open) => !open && guard.stay()}
        title={t("leaveTitle")}
        description={t("leaveBody")}
        confirmLabel={t("leaveConfirm")}
        destructive
        onConfirm={guard.leave}
      />
    </div>
  );
}

export function AdminLandingContent() {
  const t = useT(landingAdminMessages);
  const tc = useT(commonMessages);
  const query = useQuery<LandingContentResponse[]>({ queryKey: ["/api/xpot/admin/landing-content"] });
  if (query.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-red-300">
        {t("loadFailed")}
        <button type="button" onClick={() => void query.refetch()} className="rounded-lg border border-white/10 px-3 py-1 text-white/70 hover:bg-white/5">{tc("retry")}</button>
      </div>
    );
  }
  return <Editor rows={query.data} />;
}
