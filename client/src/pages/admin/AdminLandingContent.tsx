import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Field as KitField, Input, Textarea } from "@/components/xpot/Field";
import { FormFooter, UnsavedNote } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { Tabs } from "@/components/xpot/Tabs";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { formatDate } from "@/lib/dates";
import { defaultLandingContent } from "@/lib/landingContent";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { LANG_LABELS, LANGS, useI18n, useT, type Lang } from "@/i18n";
import { landingAdminMessages } from "@/i18n/messages/landingAdmin";
import { useToast } from "@/hooks/use-toast";
import type { LandingContentResponse, LandingPageContent } from "@shared/landingContent";
import { landingField, landingFieldLabel, type LandingSection } from "./landingFields";

/** One text of the page: the kit's Field with an Input, or a Textarea for the long ones. */
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <KitField label={label}>
      {multiline ? (
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </KitField>
  );
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className={`group rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-white/85 marker:content-none">
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
  const status = dirty[locale] ? (
    <UnsavedNote label={t("unsaved")} />
  ) : (
    <span className={`text-xs ${publishedAt[locale] ? "text-emerald-300/70" : "text-white/45"}`}>
      {publishedAt[locale] ? t("publishedOn", { date: formatDate(publishedAt[locale]) }) : t("usingDefault")}
    </span>
  );

  return (
    <div className="space-y-5" data-testid="admin-landing-content">
      {/* An account page: the intro card is neutral, not the Visits blue. */}
      <div className={`flex flex-col gap-4 rounded-2xl ${GLASS_CLASS} p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"><FileText className="h-5 w-5 text-slate-200" /></div>
          <div><p className="text-sm font-semibold text-white">{t("title")}</p><p className="mt-1 text-xs leading-relaxed text-white/45">{t("intro")}</p></div>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <a href={path} target="_blank" rel="noreferrer">
            <ExternalLink />{t("openPage")}
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          fill={false}
          accent="account"
          ariaLabel={t("title")}
          idPrefix="landing-lang"
          value={locale}
          onChange={setLocale}
          tabs={LANGS.map((item) => ({
            id: item,
            label: LANG_LABELS[item],
            badge: dirty[item] ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" /> : undefined,
          }))}
        />
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
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={content.faq.items.length === 1}
                  onClick={() => change((n) => { n.faq.items.splice(index, 1); })}
                  className="self-start text-white/40 hover:bg-red-500/10 hover:text-red-300"
                  title={t("removeFaq", { number: index + 1 })}
                  aria-label={t("removeFaq", { number: index + 1 })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {content.faq.items.length < 12 && (
              <Button
                variant="outline"
                // The new entry starts in the language being edited, not the admin's.
                onClick={() => change((n) => { n.faq.items.push({ id: `faq-${Date.now()}`, question: landingAdminMessages[locale].newFaqQuestion, answer: landingAdminMessages[locale].newFaqAnswer }); })}
                className="border-dashed"
              >
                <Plus />{t("addFaq")}
              </Button>
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

      {/* The one sticky footer of the admin: the editor is long, Publish stays in reach. */}
      <FormFooter sticky status={<span data-testid="landing-status">{status}</span>}>
        <Button variant="brand" disabled={!dirty[locale]} loading={save.isPending} onClick={() => save.mutate({ locale, content })} data-testid="landing-publish">
          <Save />{t("publish", { language: LANG_LABELS[locale] })}
        </Button>
      </FormFooter>

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
  const query = useQuery<LandingContentResponse[]>({ queryKey: ["/api/xpot/admin/landing-content"] });
  if (query.isLoading) return <ListSkeleton rows={5} rowClassName="h-14 rounded-2xl" />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />;
  }
  return <Editor rows={query.data} />;
}
