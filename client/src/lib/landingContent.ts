import type { Lang } from "../i18n";
import { landingMessages } from "../i18n/messages/landing";
import type { LandingPageContent } from "../../../shared/landingContent";

/** Built-in copy keeps the public page complete before the first admin publish. */
export function defaultLandingContent(lang: Lang): LandingPageContent {
  const m = landingMessages[lang];
  return {
    navigation: {
      audience: m.navAudience,
      how: m.navHow,
      faq: m.navFaq,
    },
    account: {
      dashboard: m.dashboard,
      signIn: m.signIn,
      welcomeTitle: m.welcomeTitle,
      welcomeSub: m.welcomeSub,
      primaryCta: m.getStarted,
      authenticatedCta: m.goToDashboard,
      agreementBefore: m.agreeBefore,
      agreementAnd: m.agreeAnd,
      agreementAfter: m.agreeAfter,
    },
    hero: {
      badge: m.heroBadge,
      titleLine1: m.heroTitleLine1,
      titleLine2: m.heroTitleLine2,
      body: m.heroSub,
      secondaryCta: m.exploreFeatures,
      accessNote: m.accessNote,
    },
    mockup: {
      visit: m.mockVisit,
      atDoor: m.mockAtDoor,
      timer: m.mockTimer,
      business: m.mockBusiness,
      address: m.mockAddress,
      voice: m.mockVoice,
      quote: m.mockQuote,
      aiFound: m.mockAiFound,
      sale: m.mockActionSale,
      saleValue: m.mockSaleValue,
      followUp: m.mockActionFollowUp,
      confirm: m.mockConfirm,
    },
    audience: {
      title: m.audienceTitle,
      subtitle: m.audienceSub,
      cards: [
        { imageUrl: "/landing/highlights/prospecting-route.webp", title: m.audienceExtraTitle, body: m.audienceExtraBody },
        { imageUrl: "/landing/highlights/visit-note.webp", title: m.audienceMobileTitle, body: m.audienceMobileBody },
        { imageUrl: "/landing/highlights/nfc-activation.webp", title: m.audienceIndependentTitle, body: m.audienceIndependentBody },
      ],
    },
    how: {
      title: m.howTitle,
      subtitle: m.howSub,
    },
    tools: {
      cards: [
        { title: m.routesTitle, items: [m.routes1, m.routes2, m.routes3, m.routes4] },
        { title: m.visitsTitle, items: [m.visits1, m.visits2, m.visits3, m.visits4] },
        { title: m.salesTitle, items: [m.sales1, m.sales2, m.sales3, m.sales4] },
        { title: m.tagsTitle, items: [m.tags1, m.tags2, m.tags3, m.tags4] },
      ],
    },
    faq: {
      title: m.faqTitle,
      subtitle: m.faqSub,
      items: [1, 2, 3, 4, 5, 6].map((number) => ({
        id: `faq-${number}`,
        question: m[`faq${number}Question` as keyof typeof m],
        answer: m[`faq${number}Answer` as keyof typeof m],
      })),
    },
    cta: { title: m.ctaTitle, body: m.ctaBody, button: m.accessApp },
    footer: {
      tagline: m.footerTagline,
      privacyLabel: m.privacyPolicy,
      termsLabel: m.termsOfService,
      rights: m.footerRights,
    },
  };
}

