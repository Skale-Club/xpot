import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Button } from "@/components/ui/button";
import { GLASS_CLASS, PAGE_BASE, PAGE_GRADIENT } from "@/components/xpot/surface";
import { useI18n, useT } from "@/i18n";
import { landingMessages } from "@/i18n/messages/landing";
import { LEGAL_DOCS, type LegalBlock } from "./content";
import { publicPagePath } from "@shared/seo";
import { usePublicSeo } from "@/lib/seo";

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <p>{block}</p>;
  if ("lead" in block) {
    return (
      <p>
        <strong className="font-semibold text-white">{block.lead}.</strong> {block.text}
      </p>
    );
  }
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-white/30">
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** /privacy and /terms: public, readable without signing in, in the chosen language. */
export function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { lang } = useI18n();
  const t = useT(landingMessages);
  const content = LEGAL_DOCS[doc][lang];
  const other = doc === "privacy" ? "terms" : "privacy";
  usePublicSeo(doc);
  // The support WhatsApp is configured on the server (XPOT_SUPPORT_WHATSAPP).
  const { data: config } = useQuery<{ supportWhatsapp: string | null }>({
    queryKey: ["/api/auth/phone/config"],
    retry: false,
  });
  const whatsapp = config?.supportWhatsapp ? `https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}` : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [content.title]);

  return (
    <div className="min-h-screen text-white" style={{ background: PAGE_GRADIENT }}>
      <header
        className="sticky top-0 z-40 border-b border-white/[0.06] backdrop-blur-md"
        style={{ background: `${PAGE_BASE}cc`, paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <Link href={publicPagePath("home", lang)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {t("backHome")}
          </Link>
          <LanguagePicker compact />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-5 sm:py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{content.title}</h1>
        <p className="mt-2 text-sm text-white/45">{content.updated}</p>
        <p className="mt-6 text-base leading-relaxed text-white/75">{content.intro}</p>

        <div className="mt-10 space-y-9">
          {content.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-lg font-bold text-white">{section.heading}</h2>
              <div className="space-y-3 text-[15px] leading-relaxed text-white/70">
                {section.body.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </section>
          ))}

          <section className={`space-y-3 rounded-2xl ${GLASS_CLASS} p-6`}>
            <h2 className="text-lg font-bold text-white">{t("legalContactTitle")}</h2>
            <p className="text-[15px] leading-relaxed text-white/70">{t("legalContactBody")}</p>
            {whatsapp ? (
              <Button asChild variant="secondary">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="text-emerald-300" />
                  {t("legalContactWhatsapp")}
                </a>
              </Button>
            ) : (
              <p className="text-sm text-white/50">{t("legalContactInApp")}</p>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-sm text-white/50">
        <Link href={publicPagePath(other, lang)} className="inline-flex min-h-10 items-center transition-colors hover:text-white">
          {t(other === "privacy" ? "privacyPolicy" : "termsOfService")}
        </Link>
        <p className="mt-2">{t("footerRights", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
