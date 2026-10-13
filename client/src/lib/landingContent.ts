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
      tools: m.navTools,
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
        { imageUrl: "/landing/audience/field-reps.webp", title: m.audienceRepTitle, body: m.audienceRepBody },
        { imageUrl: "/landing/audience/sales-managers.webp", title: m.audienceManagerTitle, body: m.audienceManagerBody },
        { imageUrl: "/landing/audience/distributors.webp", title: m.audienceDistributorTitle, body: m.audienceDistributorBody },
        { imageUrl: "/landing/audience/local-businesses.webp", title: m.audienceBusinessTitle, body: m.audienceBusinessBody },
      ],
    },
    how: {
      title: m.howTitle,
      subtitle: m.howSub,
      steps: [
        { title: m.step1Title, body: m.step1Body },
        { title: m.step2Title, body: m.step2Body },
        { title: m.step3Title, body: m.step3Body },
      ],
    },
    tools: {
      title: m.toolsTitle,
      subtitle: m.toolsSub,
      cards: [
        { title: m.visitsTitle, items: [m.visits1, m.visits2, m.visits3, m.visits4] },
        { title: m.salesTitle, items: [m.sales1, m.sales2, m.sales3, m.sales4] },
        { title: m.tagsTitle, items: [m.tags1, m.tags2, m.tags3, m.tags4] },
      ],
    },
    sync: { title: m.syncTitle, body: m.syncBody },
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

