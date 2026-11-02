import type { ComponentProps } from "react";
import { socialAccountOf, type AccountNetwork } from "@shared/tagApp";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { shortUrl } from "@/pages/tags/lib";

// A destination that is a social account shows as the network's icon and "@account"; any other link keeps showing as its
// address. Only what is drawn: the stored link, the open and the copy never change.

type IconSize = ComponentProps<typeof TagFaceIcon>["size"];

const X_BOX = { "2xs": "h-3 w-3 rounded-[3px]", xs: "h-5 w-5 rounded-md", sm: "h-7 w-7 rounded-lg", md: "h-9 w-9 rounded-xl", lg: "h-12 w-12 rounded-2xl" } as const;
const X_GLYPH = { "2xs": "h-2 w-2", xs: "h-3 w-3", sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" } as const;

/** The network's own tile (the one printed on pieces); X has no printed face, so it draws its own. */
export function SocialAccountIcon({ network, size = "sm" }: { network: AccountNetwork; size?: IconSize }) {
  if (network !== "x") return <TagFaceIcon face={network} size={size} />;
  const key = size ?? "sm";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-black text-white shadow-sm ring-1 ring-white/10 ${X_BOX[key]}`} role="img" aria-label="X">
      <svg viewBox="0 0 24 24" className={X_GLYPH[key]} fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </span>
  );
}

/** A destination in a list cell: the account with its icon, else the short address. */
export function DestinationLabel({ url }: { url: string }) {
  const account = socialAccountOf(url);
  if (!account) return <>{shortUrl(url)}</>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle" title={shortUrl(url)} data-testid="destination-account">
      <SocialAccountIcon network={account.network} size="xs" />
      <span className="truncate">{account.label}</span>
    </span>
  );
}
