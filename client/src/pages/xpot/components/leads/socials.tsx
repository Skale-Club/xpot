import { Facebook, Instagram, Link2, Linkedin, Twitter, Youtube, type LucideIcon } from "lucide-react";

/**
 * The social networks a company can list, with one name and one icon each,
 * shared by the company editor and the check-in brief so "X" is never
 * "Twitter" on the other screen. Brand names are not translated; "other" is.
 */
export const SOCIAL_PLATFORMS: ReadonlyArray<{ value: string; name: string | null; icon: LucideIcon }> = [
  { value: "instagram", name: "Instagram", icon: Instagram },
  { value: "linkedin", name: "LinkedIn", icon: Linkedin },
  { value: "facebook", name: "Facebook", icon: Facebook },
  { value: "twitter", name: "X", icon: Twitter },
  { value: "youtube", name: "YouTube", icon: Youtube },
  { value: "tiktok", name: "TikTok", icon: Link2 },
  { value: "other", name: null, icon: Link2 },
];

export function socialPlatform(value: string) {
  return SOCIAL_PLATFORMS.find((p) => p.value === value) ?? SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];
}

export function socialHref(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

/** The company's social links as round icon buttons, each named for screen readers. */
export function SocialLinks({ socials, otherLabel }: { socials: { platform: string; url: string }[] | null | undefined; otherLabel: string }) {
  const list = (socials ?? []).filter((s) => s.url?.trim());
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((social, i) => {
        const platform = socialPlatform(social.platform);
        const Icon = platform.icon;
        const name = platform.name ?? otherLabel;
        return (
          <a
            key={`${social.platform}-${i}`}
            href={socialHref(social.url)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={name}
            title={name}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
