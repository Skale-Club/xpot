// server/lib/files.ts: references, R2 signing (computed locally, no network),
// and best-effort cleanup.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createR2Store,
  discardFiles,
  legacyPublicPath,
  parseRef,
  setFileStoresForTests,
  uploaderRepId,
} from "../server/lib/files.js";
import { memoryStore } from "./helpers/memoryStore.js";

afterEach(() => setFileStoresForTests(null));

describe("file references", () => {
  it("parses stored references and rejects anything that is not kind/repId/file", () => {
    expect(parseRef("r2:audio/12/visit_1_2.webm")).toEqual({ kind: "stored", backend: "r2", key: "audio/12/visit_1_2.webm" });
    expect(parseRef("supabase:photos/3/lead_1_2.jpg")).toEqual({ kind: "stored", backend: "supabase", key: "photos/3/lead_1_2.jpg" });
    for (const bad of ["r2:photos/x/a.jpg", "r2:photos/1/../a.jpg", "r2:photos/1/a/b.jpg", "r2:avatars/1/a.jpg", "gs:photos/1/a.jpg", "photos/1/a.jpg", ""]) {
      expect(parseRef(bad), bad).toBeNull();
    }
  });

  it("recognises legacy public Supabase URLs", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/uploads/audio/7/visit_9_1.webm";
    expect(parseRef(url)).toEqual({ kind: "legacy", url, publicPath: "audio/7/visit_9_1.webm" });
    expect(legacyPublicPath("https://lh3.googleusercontent.com/a/photo.jpg")).toBeNull();
  });

  it("knows who uploaded a file from its path", () => {
    expect(uploaderRepId("r2:photos/12/lead_1_2.jpg")).toBe(12);
    expect(uploaderRepId("https://abc.supabase.co/storage/v1/object/public/uploads/avatars/4/me.jpg")).toBe(4);
    expect(uploaderRepId("https://example.com/x.jpg")).toBeNull();
  });
});

describe("R2", () => {
  it("signs a GET that expires, for the object in the configured bucket", async () => {
    const r2 = createR2Store({
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      bucket: "xpot-files",
      endpoint: "https://acct123.r2.cloudflarestorage.com",
    });
    const url = new URL(await r2.signedUrl("photos/1/lead_1_2.jpg", 300));
    expect(url.origin + url.pathname).toBe("https://acct123.r2.cloudflarestorage.com/xpot-files/photos/1/lead_1_2.jpg");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("discardFiles", () => {
  it("deletes stored and legacy files from the right store, ignores foreign URLs", async () => {
    const r2 = memoryStore("r2", ["photos/1/a.jpg"]);
    const pub = memoryStore("supabase", ["photos/1/old.jpg"]);
    setFileStoresForTests({ r2, supabase: null, public: pub });
    const result = await discardFiles(
      ["r2:photos/1/a.jpg", "r2:photos/1/a.jpg", "https://x.supabase.co/storage/v1/object/public/uploads/photos/1/old.jpg", "https://elsewhere.example/p.jpg", null],
      "test",
    );
    expect(result).toEqual({ deleted: 2, failed: 0 });
    expect(r2.removed).toEqual(["photos/1/a.jpg"]);
    expect(pub.removed).toEqual(["photos/1/old.jpg"]);
  });

  it("never throws; it logs what was left behind", async () => {
    const r2 = memoryStore("r2", ["photos/1/a.jpg"]);
    r2.failRemove = true;
    setFileStoresForTests({ r2, supabase: null, public: null });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(discardFiles(["r2:photos/1/a.jpg", "supabase:photos/1/b.jpg"], "ctx")).resolves.toEqual({ deleted: 0, failed: 2 });
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});
