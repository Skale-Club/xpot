// Links to a social network open the network's app, never a web page inside Xpot.
//
// An installed Android app (a WebAPK) shows any other site in an in-app browser
// tab, and that tab does not hand instagram.com over to the Instagram app. An
// Android intent link does: Chrome opens the app that owns the link, and falls
// back to the web page only when the app is not installed. iPhones and
// computers keep the plain https link (iOS hands those to the app on its own).

export type LinkPlatform = "android" | "ios" | "other";

/** Android package of the app that owns each network's links. */
const ANDROID_APPS: ReadonlyArray<{ hosts: readonly string[]; pkg: string }> = [
  { hosts: ["instagram.com"], pkg: "com.instagram.android" },
  { hosts: ["facebook.com", "fb.com", "fb.me", "m.me"], pkg: "com.facebook.katana" },
  { hosts: ["tiktok.com"], pkg: "com.zhiliaoapp.musically" },
  { hosts: ["wa.me", "whatsapp.com"], pkg: "com.whatsapp" },
  { hosts: ["youtube.com", "youtu.be"], pkg: "com.google.android.youtube" },
  { hosts: ["x.com", "twitter.com"], pkg: "com.twitter.android" },
  { hosts: ["linkedin.com"], pkg: "com.linkedin.android" },
  { hosts: ["threads.net", "threads.com"], pkg: "com.instagram.barcelona" },
  { hosts: ["pinterest.com"], pkg: "com.pinterest" },
  { hosts: ["snapchat.com"], pkg: "com.snapchat.android" },
  { hosts: ["t.me", "telegram.me"], pkg: "org.telegram.messenger" },
];

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** The Android app that owns this link, or null when it is any other site. */
export function androidAppFor(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  return ANDROID_APPS.find((app) => hostMatches(host, app.hosts))?.pkg ?? null;
}

/**
 * The link as the phone should open it: on Android a social link becomes an
 * intent link that opens the network's app (with the web page as the fallback
 * when the app is missing); anything else, anywhere else, is the link itself.
 */
export function appLinkHref(rawUrl: string, platform: LinkPlatform): string {
  if (platform !== "android") return rawUrl;
  const pkg = androidAppFor(rawUrl);
  if (!pkg) return rawUrl;
  const url = new URL(rawUrl);
  // A fragment would end the intent early (#Intent is its own marker); profile links carry none worth keeping.
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=${pkg};S.browser_fallback_url=${encodeURIComponent(rawUrl)};end`;
}

/** Whether the link opens an app rather than a page, so the anchor must navigate in place (a new tab cannot launch it). */
export function isAppLink(href: string): boolean {
  return href.startsWith("intent://");
}
