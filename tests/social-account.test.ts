import { describe, expect, it } from "vitest";
import { socialAccountOf } from "../shared/tagApp";

// A destination shown as its account only when it plainly is one; anything else stays null so the address shows as it is.
const CASES: Array<[string, string | null, string]> = [
  ["https://instagram.com/celesconfections", "instagram", "@celesconfections"],
  ["https://www.instagram.com/celesconfections/", "instagram", "@celesconfections"],
  ["instagram.com/celesconfections", "instagram", "@celesconfections"],
  ["https://m.instagram.com/celes.confections?utm_source=qr", "instagram", "@celes.confections"],
  ["https://www.instagram.com/@celesconfections", "instagram", "@celesconfections"],
  ["https://instagram.com/celesconfections/?igsh=abc#top", "instagram", "@celesconfections"],
  ["https://instagram.com/p/abc123", null, ""],
  ["https://instagram.com/reel/abc123/", null, ""],
  ["https://instagram.com/celesconfections/reels", null, ""],
  ["https://instagram.com/", null, ""],
  ["https://web.facebook.com/celesconfections", "facebook", "@celesconfections"],
  ["https://m.facebook.com/celes.confections/", "facebook", "@celes.confections"],
  ["https://facebook.com/profile.php?id=1", null, ""],
  ["https://facebook.com/share/abc", null, ""],
  ["https://www.tiktok.com/@celes", "tiktok", "@celes"],
  ["https://www.tiktok.com/@celes/video/123", null, ""],
  ["https://vm.tiktok.com/ZMabc/", null, ""],
  ["https://www.youtube.com/@CelesConfections", "youtube", "@CelesConfections"],
  ["https://youtube.com/c/celesconfections", "youtube", "celesconfections"],
  ["https://www.youtube.com/channel/UC1234567890", null, ""],
  ["https://www.youtube.com/watch?v=abc", null, ""],
  ["https://x.com/celes_co", "x", "@celes_co"],
  ["https://mobile.twitter.com/celes_co/", "x", "@celes_co"],
  ["https://twitter.com/celes_co/status/1", null, ""],
  ["https://x.com/intent/tweet", null, ""],
  ["https://www.linkedin.com/in/celes-confections/", "linkedin", "celes-confections"],
  ["https://linkedin.com/company/celes", "linkedin", "celes"],
  ["https://www.linkedin.com/feed/", null, ""],
  ["https://wa.me/15551234567", "whatsapp", "+15551234567"],
  ["https://wa.me/message/ABCDEF", null, ""],
  ["https://api.whatsapp.com/send?phone=5511999998888&text=hi", "whatsapp", "+5511999998888"],
  ["https://celesconfections.com/instagram.com/celes", null, ""],
  ["https://notinstagram.com/celes", null, ""],
  ["mailto:a@instagram.com", null, ""],
  ["", null, ""],
];

describe("socialAccountOf", () => {
  it.each(CASES)("%s", (url, network, label) => {
    const got = socialAccountOf(url);
    expect(got ? { network: got.network, label: got.label } : null).toEqual(network ? { network, label } : null);
  });
  it("gives null for nothing", () => {
    expect(socialAccountOf(null)).toBeNull();
    expect(socialAccountOf(undefined)).toBeNull();
  });
});
