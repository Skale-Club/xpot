import { describe, expect, it } from "vitest";
import { devicePlatform, isIpadDevice } from "../client/src/lib/device.js";

describe("devicePlatform", () => {
  it("tells iPhone, iPad, Android and computers apart", () => {
    expect(devicePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe("ios");
    // iPadOS asks for the desktop site and reports itself as a Mac with touch.
    expect(devicePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(devicePlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0", 5)).toBe("android");
    expect(devicePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("other");
    expect(devicePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", 0)).toBe("other");
  });

  it("spots an iPad, which has no NFC", () => {
    expect(isIpadDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIpadDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIpadDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(false);
    expect(isIpadDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
  });
});
