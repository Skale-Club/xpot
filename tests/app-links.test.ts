import { describe, expect, it } from "vitest";
import { androidAppFor, appLinkHref, isAppLink } from "../shared/appLinks";

describe("appLinkHref", () => {
  it("turns a social link into an Android intent that opens the network's app", () => {
    const href = appLinkHref("https://www.instagram.com/celesconfections/", "android");
    expect(href).toBe(
      "intent://www.instagram.com/celesconfections/#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com%2Fcelesconfections%2F;end",
    );
    expect(isAppLink(href)).toBe(true);
  });

  it("keeps the query and drops the fragment, which would end the intent", () => {
    expect(appLinkHref("https://api.whatsapp.com/send?phone=15551234567&text=hi#top", "android")).toBe(
      "intent://api.whatsapp.com/send?phone=15551234567&text=hi#Intent;scheme=https;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fapi.whatsapp.com%2Fsend%3Fphone%3D15551234567%26text%3Dhi%23top;end",
    );
  });

  it.each([
    ["https://instagram.com/celes", "com.instagram.android"],
    ["https://m.facebook.com/celes", "com.facebook.katana"],
    ["https://www.tiktok.com/@celes", "com.zhiliaoapp.musically"],
    ["https://wa.me/15551234567", "com.whatsapp"],
    ["https://youtu.be/abc", "com.google.android.youtube"],
    ["https://x.com/celes", "com.twitter.android"],
    ["https://www.linkedin.com/in/celes/", "com.linkedin.android"],
  ])("knows the app for %s", (url, pkg) => {
    expect(androidAppFor(url)).toBe(pkg);
  });

  it("leaves any other site, and anything that is not a link, alone", () => {
    expect(appLinkHref("https://celesconfections.com/menu", "android")).toBe("https://celesconfections.com/menu");
    expect(appLinkHref("https://notinstagram.com/celes", "android")).toBe("https://notinstagram.com/celes");
    expect(appLinkHref("https://celes.com/instagram.com/x", "android")).toBe("https://celes.com/instagram.com/x");
    expect(appLinkHref("mailto:a@instagram.com", "android")).toBe("mailto:a@instagram.com");
    expect(appLinkHref("not a link", "android")).toBe("not a link");
    expect(androidAppFor("https://g.page/r/abc/review")).toBeNull();
  });

  it("keeps the plain link on iPhone and computers, which open the app on their own", () => {
    expect(appLinkHref("https://instagram.com/celes", "ios")).toBe("https://instagram.com/celes");
    expect(appLinkHref("https://instagram.com/celes", "other")).toBe("https://instagram.com/celes");
    expect(isAppLink("https://instagram.com/celes")).toBe(false);
  });
});
