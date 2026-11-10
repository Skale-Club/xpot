// The attributes of an <a> that leaves Xpot for a customer's or a network's
// link. A social link on Android opens the network's app (shared/appLinks);
// every other link opens in a new tab. One place, so no screen opens
// instagram.com inside the app again.

import { appLinkHref, isAppLink } from "@shared/appLinks";
import { currentPlatform } from "@/lib/device";

export interface ExternalLinkProps {
  href: string;
  target?: "_blank";
  rel: "noopener noreferrer";
}

export function externalLinkProps(url: string): ExternalLinkProps {
  const href = appLinkHref(url, currentPlatform());
  // An intent link must navigate the page itself: Chrome launches the app and
  // the page stays; a new tab would be left blank.
  if (isAppLink(href)) return { href, rel: "noopener noreferrer" };
  return { href, target: "_blank", rel: "noopener noreferrer" };
}
