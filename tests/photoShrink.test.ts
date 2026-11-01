import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { setFileStoresForTests, type Backend, type FileStore } from "../server/lib/files.js";
import { shrinkLeadPhotos, shrinkPhoto, shrunkKeyOf, type ShrinkLead } from "../server/lib/photoShrink.js";

function memoryStore(backend: Backend): FileStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    backend,
    files,
    async put(key, body) {
      files.set(key, body);
    },
    async remove(keys) {
      keys.forEach((key) => files.delete(key));
    },
    async signedUrl(key) {
      return `https://signed/${key}`;
    },
    async list(prefix) {
      return Array.from(files.keys()).filter((key) => key.startsWith(prefix));
    },
    async get(key) {
      const file = files.get(key);
      if (!file) throw new Error(`missing ${key}`);
      return file;
    },
  };
}

/** Noise compresses badly, like a real photo does. */
function noisyPhoto(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24;
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

describe("shrinkPhoto", () => {
  it("brings a big photo down to the longest edge, as a smaller JPEG", async () => {
    const original = await noisyPhoto(4000, 3000).jpeg({ quality: 95 }).toBuffer();
    const result = await shrinkPhoto(original);
    expect(result.status).toBe("shrunk");
    if (result.status !== "shrunk") return;
    expect(result.bytes.length).toBeLessThan(original.length);
    const { width, height, format } = await sharp(result.bytes).metadata();
    expect([width, height, format]).toEqual([1600, 1200, "jpeg"]);
  });

  it("applies the EXIF orientation, so a phone's portrait photo stays upright", async () => {
    const original = await noisyPhoto(3000, 2000).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
    const result = await shrinkPhoto(original);
    if (result.status !== "shrunk") throw new Error(result.status);
    const { width, height, orientation } = await sharp(result.bytes).metadata();
    expect([width, height, orientation]).toEqual([1067, 1600, undefined]);
  });

  it("leaves a small photo alone", async () => {
    const original = await noisyPhoto(400, 300).jpeg({ quality: 70 }).toBuffer();
    expect((await shrinkPhoto(original)).status).toBe("fine");
  });

  it("reports what it cannot read instead of failing", async () => {
    expect((await shrinkPhoto(new Uint8Array(500_000))).status).toBe("unreadable");
  });
});

describe("shrinkLeadPhotos", () => {
  const key = "photos/12/lead_7_1730000000000.jpg";
  const ref = `r2:${key}`;
  let r2: ReturnType<typeof memoryStore>;
  let leads: ShrinkLead[];
  const savePhotos = async (leadId: number, previous: string[], next: string[]) => {
    const lead = leads.find(({ id }) => id === leadId)!;
    if (JSON.stringify(lead.photos) !== JSON.stringify(previous)) return false;
    lead.photos = next;
    return true;
  };

  beforeEach(async () => {
    r2 = memoryStore("r2");
    r2.files.set(key, await noisyPhoto(3000, 2000).jpeg({ quality: 95 }).toBuffer());
    setFileStoresForTests({ r2, supabase: null, public: null });
    leads = [{ id: 7, photos: [ref, "https://maps.example.com/street.jpg"] }];
  });
  afterEach(() => setFileStoresForTests(null));

  it("writes nothing on a dry run, and still measures", async () => {
    const stats = await shrinkLeadPhotos({ leads, apply: false, deleteOld: false, savePhotos });
    expect(stats).toMatchObject({ photos: 1, shrunk: 1, external: 1, originalsDeleted: 0 });
    expect(stats.bytesAfter).toBeLessThan(stats.bytesNow);
    expect(Array.from(r2.files.keys())).toEqual([key]);
    expect(leads[0].photos![0]).toBe(ref);
  });

  it("applies beside the original, then deletes it only on a separate run", async () => {
    await shrinkLeadPhotos({ leads, apply: true, deleteOld: false, savePhotos });
    const shrunk = shrunkKeyOf(key);
    expect(leads[0].photos).toEqual([`r2:${shrunk}`, "https://maps.example.com/street.jpg"]);
    expect(r2.files.has(key)).toBe(true);
    expect(r2.files.has(shrunk)).toBe(true);

    const again = await shrinkLeadPhotos({ leads, apply: false, deleteOld: false, savePhotos });
    expect(again).toMatchObject({ alreadyShrunk: 1, shrunk: 0, originalsWaiting: 1, originalsDeleted: 0 });
    expect(r2.files.has(key)).toBe(true);

    const cleaned = await shrinkLeadPhotos({ leads, apply: false, deleteOld: true, savePhotos });
    expect(cleaned.originalsDeleted).toBe(1);
    expect(r2.files.has(key)).toBe(false);
    expect(r2.files.has(shrunk)).toBe(true);
  });

  it("never deletes a file a lead still points at, or an unrelated one in the folder", async () => {
    const other = "photos/12/lead_9_1730000000001.jpg";
    r2.files.set(other, new Uint8Array([1]));
    await shrinkLeadPhotos({ leads, apply: true, deleteOld: false, savePhotos });
    leads.push({ id: 8, photos: [ref] });
    const cleaned = await shrinkLeadPhotos({ leads, apply: false, deleteOld: true, savePhotos });
    expect(cleaned.originalsDeleted).toBe(0);
    expect(r2.files.has(key)).toBe(true);
    expect(r2.files.has(other)).toBe(true);
  });

  it("leaves a lead alone if its photos changed during the run", async () => {
    const stats = await shrinkLeadPhotos({ leads, apply: true, deleteOld: false, savePhotos: async () => false });
    expect(stats.leadsChangedMeanwhile).toBe(1);
    expect(leads[0].photos![0]).toBe(ref);
  });

  it("refuses to apply and delete in the same run", async () => {
    await expect(shrinkLeadPhotos({ leads, apply: true, deleteOld: true, savePhotos })).rejects.toThrow("separately");
  });
});
