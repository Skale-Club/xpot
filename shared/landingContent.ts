import { z } from "zod";

export const LANDING_LOCALES = ["en", "pt", "es"] as const;
export const landingLocaleSchema = z.enum(LANDING_LOCALES);
export type LandingLocale = z.infer<typeof landingLocaleSchema>;

const shortText = z.string().trim().min(1).max(160);
const bodyText = z.string().trim().min(1).max(1200);
const imagePath = z.string().trim().min(1).max(500);

const titledBodySchema = z.object({
  title: shortText,
  body: bodyText,
});

export const landingFaqItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(240),
  answer: z.string().trim().min(1).max(1600),
});

export const landingPageContentSchema = z.object({
  navigation: z.object({
    audience: shortText,
    how: shortText,
    tools: shortText,
    faq: shortText,
  }),
  account: z.object({
    dashboard: shortText,
    signIn: shortText,
    welcomeTitle: shortText,
    welcomeSub: bodyText,
    primaryCta: shortText,
    authenticatedCta: shortText,
    agreementBefore: shortText,
    agreementAnd: shortText,
    agreementAfter: z.string().max(40),
  }),
  hero: z.object({
    badge: shortText,
    titleLine1: shortText,
    titleLine2: shortText,
    body: bodyText,
    secondaryCta: shortText,
    accessNote: bodyText,
  }),
  mockup: z.object({
    visit: shortText,
    atDoor: shortText,
    timer: shortText,
    business: shortText,
    address: shortText,
    voice: shortText,
    quote: bodyText,
    aiFound: shortText,
    sale: shortText,
    saleValue: shortText,
    followUp: shortText,
    confirm: shortText,
  }),
  audience: z.object({
    title: shortText,
    subtitle: bodyText,
    cards: z.array(titledBodySchema.extend({ imageUrl: imagePath })).length(4),
  }),
  how: z.object({
    title: shortText,
    subtitle: bodyText,
    steps: z.array(titledBodySchema).length(3),
  }),
  tools: z.object({
    title: shortText,
    subtitle: bodyText,
    cards: z.array(z.object({
      title: shortText,
      items: z.array(z.string().trim().min(1).max(300)).length(4),
    })).length(3),
  }),
  sync: titledBodySchema,
  faq: z.object({
    title: shortText,
    subtitle: bodyText,
    items: z.array(landingFaqItemSchema).min(1).max(12),
  }),
  cta: titledBodySchema.extend({ button: shortText }),
  footer: z.object({
    tagline: shortText,
    privacyLabel: shortText,
    termsLabel: shortText,
    rights: shortText,
  }),
});

export type LandingPageContent = z.infer<typeof landingPageContentSchema>;

export type LandingContentResponse = {
  locale: LandingLocale;
  content: LandingPageContent | null;
  updatedAt: string | null;
};

