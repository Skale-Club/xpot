import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { defaultLandingContent } from "@/lib/landingContent";
import { LANG_LABELS, LANGS, useI18n, type Lang } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import type { LandingContentResponse, LandingPageContent } from "@shared/landingContent";

const INPUT = "w-full rounded-xl border border-white/10 bg-[#080d19] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-blue-500/60";
const TEXTAREA = `${INPUT} min-h-24 resize-y leading-relaxed`;

const ui = {
  en: { intro: "Edit every text and image shown on the public landing page.", preview: "Open landing page", save: "Publish language", saved: "Landing page published", failed: "Could not publish", unsaved: "Unsaved changes", published: "Published", addFaq: "Add question", remove: "Remove", question: "Question", answer: "Answer", image: "Image path or URL", item: "Item", sections: ["Navigation & account", "Hero & app preview", "Who it's for", "How it works", "Tools", "CRM sync", "FAQ", "Final call to action", "Footer"] },
  pt: { intro: "Edite todos os textos e imagens exibidos na landing page pública.", preview: "Abrir landing page", save: "Publicar idioma", saved: "Landing page publicada", failed: "Não foi possível publicar", unsaved: "Alterações não publicadas", published: "Publicado", addFaq: "Adicionar pergunta", remove: "Remover", question: "Pergunta", answer: "Resposta", image: "Caminho ou URL da imagem", item: "Item", sections: ["Navegação e acesso", "Hero e prévia do app", "Para quem é", "Como funciona", "Ferramentas", "Sincronização com CRM", "Perguntas frequentes", "Chamada final", "Rodapé"] },
  es: { intro: "Edita todos los textos e imágenes de la landing page pública.", preview: "Abrir landing page", save: "Publicar idioma", saved: "Landing page publicada", failed: "No se pudo publicar", unsaved: "Cambios sin publicar", published: "Publicado", addFaq: "Agregar pregunta", remove: "Eliminar", question: "Pregunta", answer: "Respuesta", image: "Ruta o URL de la imagen", item: "Elemento", sections: ["Navegación y acceso", "Hero y vista de la app", "Para quién es", "Cómo funciona", "Herramientas", "Sincronización con CRM", "Preguntas frecuentes", "Llamada final", "Pie de página"] },
} as const;

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

function Editor({ rows }: { rows: LandingContentResponse[] }) {
  const { lang: interfaceLang } = useI18n();
  const copy = ui[interfaceLang];
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initial = useMemo(() => Object.fromEntries(LANGS.map((locale) => {
    const saved = rows.find((row) => row.locale === locale)?.content;
    return [locale, saved ?? defaultLandingContent(locale)];
  })) as Record<Lang, LandingPageContent>, [rows]);
  const [locale, setLocale] = useState<Lang>(interfaceLang);
  const [drafts, setDrafts] = useState(initial);
  const [dirty, setDirty] = useState<Record<Lang, boolean>>({ en: false, pt: false, es: false });
  const content = drafts[locale];

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
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/landing-content"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/landing", saved.locale] });
      toast({ title: copy.saved, variant: "success" });
    },
    onError: (error: Error) => toast({ title: copy.failed, description: error.message, variant: "destructive" }),
  });

  const path = locale === "en" ? "/" : `/${locale}`;
  const setString = (apply: (next: LandingPageContent, value: string) => void) => (value: string) => change((next) => apply(next, value));

  return (
    <div className="space-y-5" data-testid="admin-landing-content">
      <div className="flex flex-col gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"><FileText className="h-5 w-5 text-blue-300" /></div>
          <div><p className="text-sm font-semibold text-white">Landing page</p><p className="mt-1 text-xs leading-relaxed text-white/45">{copy.intro}</p></div>
        </div>
        <a href={path} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" />{copy.preview}
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {LANGS.map((item) => <button key={item} type="button" onClick={() => setLocale(item)} className={`relative rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${locale === item ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"}`}>{LANG_LABELS[item]}{dirty[item] && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />}</button>)}
        </div>
        <span className={`text-xs ${dirty[locale] ? "text-amber-300" : "text-emerald-300/70"}`}>{dirty[locale] ? copy.unsaved : copy.published}</span>
      </div>

      <div className="space-y-3">
        <Section title={copy.sections[0]} open>
          {(["audience", "how", "tools", "faq"] as const).map((key) => <Field key={key} label={`Menu · ${key}`} value={content.navigation[key]} onChange={setString((next, value) => { next.navigation[key] = value; })} />)}
          <Field label="Login" value={content.account.signIn} onChange={setString((n, v) => { n.account.signIn = v; })} />
          <Field label="Dashboard" value={content.account.dashboard} onChange={setString((n, v) => { n.account.dashboard = v; })} />
          <Field label="Título do acesso" value={content.account.welcomeTitle} onChange={setString((n, v) => { n.account.welcomeTitle = v; })} />
          <Field label="Descrição do acesso" value={content.account.welcomeSub} multiline onChange={setString((n, v) => { n.account.welcomeSub = v; })} />
          <Field label="Botão principal" value={content.account.primaryCta} onChange={setString((n, v) => { n.account.primaryCta = v; })} />
          <Field label="Botão autenticado" value={content.account.authenticatedCta} onChange={setString((n, v) => { n.account.authenticatedCta = v; })} />
          <Field label="Acordo · antes" value={content.account.agreementBefore} onChange={setString((n, v) => { n.account.agreementBefore = v; })} />
          <Field label="Acordo · conexão" value={content.account.agreementAnd} onChange={setString((n, v) => { n.account.agreementAnd = v; })} />
          <Field label="Acordo · final" value={content.account.agreementAfter} onChange={setString((n, v) => { n.account.agreementAfter = v; })} />
        </Section>

        <Section title={copy.sections[1]}>
          <Field label="Badge" value={content.hero.badge} onChange={setString((n, v) => { n.hero.badge = v; })} />
          <Field label="Título · linha 1" value={content.hero.titleLine1} onChange={setString((n, v) => { n.hero.titleLine1 = v; })} />
          <Field label="Título · linha 2" value={content.hero.titleLine2} onChange={setString((n, v) => { n.hero.titleLine2 = v; })} />
          <Field label="Descrição" value={content.hero.body} multiline onChange={setString((n, v) => { n.hero.body = v; })} />
          <Field label="Botão secundário" value={content.hero.secondaryCta} onChange={setString((n, v) => { n.hero.secondaryCta = v; })} />
          <Field label="Nota de acesso" value={content.hero.accessNote} multiline onChange={setString((n, v) => { n.hero.accessNote = v; })} />
          {Object.entries(content.mockup).map(([key, value]) => <Field key={key} label={`Prévia · ${key}`} value={value} multiline={key === "quote"} onChange={(newValue) => change((n) => { n.mockup[key as keyof typeof n.mockup] = newValue; })} />)}
        </Section>

        <Section title={copy.sections[2]}>
          <Field label="Título" value={content.audience.title} onChange={setString((n, v) => { n.audience.title = v; })} />
          <Field label="Subtítulo" value={content.audience.subtitle} multiline onChange={setString((n, v) => { n.audience.subtitle = v; })} />
          {content.audience.cards.map((card, index) => <div key={index} className="space-y-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:col-span-2"><p className="text-xs font-semibold text-blue-300">{index + 1}</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={card.title} onChange={(v) => change((n) => { n.audience.cards[index].title = v; })} /><Field label={copy.image} value={card.imageUrl} onChange={(v) => change((n) => { n.audience.cards[index].imageUrl = v; })} /><div className="sm:col-span-2"><Field label="Descrição" value={card.body} multiline onChange={(v) => change((n) => { n.audience.cards[index].body = v; })} /></div></div></div>)}
        </Section>

        <Section title={copy.sections[3]}>
          <Field label="Título" value={content.how.title} onChange={setString((n, v) => { n.how.title = v; })} />
          <Field label="Subtítulo" value={content.how.subtitle} multiline onChange={setString((n, v) => { n.how.subtitle = v; })} />
          {content.how.steps.map((step, index) => <div key={index} className="space-y-3 rounded-xl border border-white/[0.07] p-4"><p className="text-xs font-semibold text-blue-300">{index + 1}</p><Field label="Título" value={step.title} onChange={(v) => change((n) => { n.how.steps[index].title = v; })} /><Field label="Descrição" value={step.body} multiline onChange={(v) => change((n) => { n.how.steps[index].body = v; })} /></div>)}
        </Section>

        <Section title={copy.sections[4]}>
          <Field label="Título" value={content.tools.title} onChange={setString((n, v) => { n.tools.title = v; })} />
          <Field label="Subtítulo" value={content.tools.subtitle} multiline onChange={setString((n, v) => { n.tools.subtitle = v; })} />
          {content.tools.cards.map((card, cardIndex) => <div key={cardIndex} className="space-y-3 rounded-xl border border-white/[0.07] p-4"><Field label="Título" value={card.title} onChange={(v) => change((n) => { n.tools.cards[cardIndex].title = v; })} />{card.items.map((item, itemIndex) => <Field key={itemIndex} label={`${copy.item} ${itemIndex + 1}`} value={item} onChange={(v) => change((n) => { n.tools.cards[cardIndex].items[itemIndex] = v; })} />)}</div>)}
        </Section>

        <Section title={copy.sections[5]}>
          <Field label="Título" value={content.sync.title} onChange={setString((n, v) => { n.sync.title = v; })} />
          <Field label="Descrição" value={content.sync.body} multiline onChange={setString((n, v) => { n.sync.body = v; })} />
        </Section>

        <Section title={copy.sections[6]}>
          <Field label="Título" value={content.faq.title} onChange={setString((n, v) => { n.faq.title = v; })} />
          <Field label="Subtítulo" value={content.faq.subtitle} multiline onChange={setString((n, v) => { n.faq.subtitle = v; })} />
          <div className="space-y-3 sm:col-span-2">
            {content.faq.items.map((item, index) => <div key={item.id} className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:grid-cols-[1fr_auto]"><div className="space-y-3"><Field label={`${copy.question} ${index + 1}`} value={item.question} onChange={(v) => change((n) => { n.faq.items[index].question = v; })} /><Field label={copy.answer} value={item.answer} multiline onChange={(v) => change((n) => { n.faq.items[index].answer = v; })} /></div><button type="button" disabled={content.faq.items.length === 1} onClick={() => change((n) => { n.faq.items.splice(index, 1); })} className="self-start rounded-lg p-2 text-white/35 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-20" title={copy.remove}><Trash2 className="h-4 w-4" /></button></div>)}
            {content.faq.items.length < 12 && <button type="button" onClick={() => change((n) => { n.faq.items.push({ id: `faq-${Date.now()}`, question: "Nova pergunta", answer: "Nova resposta" }); })} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-xs font-semibold text-white/55 hover:border-blue-400/40 hover:text-blue-300"><Plus className="h-4 w-4" />{copy.addFaq}</button>}
          </div>
        </Section>

        <Section title={copy.sections[7]}>
          <Field label="Título" value={content.cta.title} onChange={setString((n, v) => { n.cta.title = v; })} />
          <Field label="Descrição" value={content.cta.body} multiline onChange={setString((n, v) => { n.cta.body = v; })} />
          <Field label="Botão" value={content.cta.button} onChange={setString((n, v) => { n.cta.button = v; })} />
        </Section>

        <Section title={copy.sections[8]}>
          <Field label="Assinatura" value={content.footer.tagline} onChange={setString((n, v) => { n.footer.tagline = v; })} />
          <Field label="Privacidade" value={content.footer.privacyLabel} onChange={setString((n, v) => { n.footer.privacyLabel = v; })} />
          <Field label="Termos" value={content.footer.termsLabel} onChange={setString((n, v) => { n.footer.termsLabel = v; })} />
          <Field label="Direitos · use {year}" value={content.footer.rights} onChange={setString((n, v) => { n.footer.rights = v; })} />
        </Section>
      </div>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button type="button" disabled={!dirty[locale] || save.isPending} onClick={() => save.mutate({ locale, content })} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-45">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{copy.save}
        </button>
      </div>
    </div>
  );
}

export function AdminLandingContent() {
  const query = useQuery<LandingContentResponse[]>({ queryKey: ["/api/xpot/admin/landing-content"] });
  if (query.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  if (query.isError || !query.data) return <p className="py-12 text-center text-sm text-red-300">{query.error instanceof Error ? query.error.message : "Could not load landing page content."}</p>;
  return <Editor rows={query.data} />;
}

