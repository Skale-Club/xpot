// Which "Install app" entry a browser gets (client/src/lib/pwa.ts). The entry is
// passive, so the main ways to get it wrong are showing it where it can't work
// (Firefox, an installed app) or hiding it on iPhones, which never fire a prompt.

import { describe, expect, it } from "vitest";
import { resolveInstallMode } from "../client/src/lib/pwa.js";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macSafari17: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macSafari16: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
};

const base = { standalone: false, installed: false, hasPrompt: false, maxTouchPoints: 0 };

describe("resolveInstallMode", () => {
  it("hides the entry inside the installed app, whatever the browser offers", () => {
    expect(resolveInstallMode({ ...base, standalone: true, hasPrompt: true, userAgent: UA.androidChrome })).toBe("hidden");
    expect(resolveInstallMode({ ...base, standalone: true, userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe("hidden");
  });

  it("hides it once the app was installed from this tab", () => {
    expect(resolveInstallMode({ ...base, installed: true, hasPrompt: true, userAgent: UA.androidChrome })).toBe("hidden");
  });

  it("uses the native prompt when Chromium handed one over", () => {
    expect(resolveInstallMode({ ...base, hasPrompt: true, userAgent: UA.androidChrome })).toBe("prompt");
    expect(resolveInstallMode({ ...base, hasPrompt: true, userAgent: UA.macChrome })).toBe("prompt");
  });

  it("explains Add to Home Screen on iPhone and iPad, in any browser", () => {
    expect(resolveInstallMode({ ...base, userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe("ios");
    expect(resolveInstallMode({ ...base, userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe("ios");
    expect(resolveInstallMode({ ...base, userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toBe("ios");
  });

  it("explains Add to Dock on Safari 17+ for Mac only", () => {
    expect(resolveInstallMode({ ...base, userAgent: UA.macSafari17 })).toBe("safari-mac");
    expect(resolveInstallMode({ ...base, userAgent: UA.macSafari16 })).toBe("hidden");
  });

  it("offers nothing where installing isn't possible yet", () => {
    expect(resolveInstallMode({ ...base, userAgent: UA.winFirefox })).toBe("hidden");
    // Chromium that hasn't (or won't) fire beforeinstallprompt.
    expect(resolveInstallMode({ ...base, userAgent: UA.macChrome })).toBe("hidden");
    expect(resolveInstallMode({ ...base, userAgent: UA.androidChrome })).toBe("hidden");
  });
});
