// Which kind of phone this is, for the few things that really differ between
// them (how NFC chips are written, where location permission lives, which map
// app opens). Screens use it to show only what applies to this device, never a
// "this only works on X" notice for something the person cannot do here.

export type DevicePlatform = "ios" | "android" | "other";

/** iPadOS reports itself as a Mac; touch support tells them apart. */
export function isAppleMobileDevice(userAgent: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** An iPad has no NFC at all, unlike an iPhone. */
export function isIpadDevice(userAgent: string, maxTouchPoints: number) {
  return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function devicePlatform(userAgent: string, maxTouchPoints: number): DevicePlatform {
  if (isAppleMobileDevice(userAgent, maxTouchPoints)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** This browser's platform; "other" (a computer) outside a browser. */
export function currentPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "other";
  return devicePlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function isIpad(): boolean {
  return typeof navigator !== "undefined" && isIpadDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
