// Private photos and voice notes (server/lib/files.ts, routes/xpot/files.ts):
// who gets a signed URL, and which files are deleted when a photo, a lead or
// a visit goes. Real routers, mocked storage layer, in-memory file stores.

import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore, type MemoryStore } from "./helpers/memoryStore.js";

const store = {
  reps: new Map<number, any>(),
  leads: new Map<number, any>(),
  visits: new Map<number, any>(),
  notes: new Map<number, any>(),
  deletedLeadFiles: [] as string[],
  deletedVisitFiles: [] as string[],
};

const storage = {
  getSalesRepByUserId: vi.fn(async (userId: string) => [...store.reps.values()].find((r) => r.userId === userId)),
  getSalesLead: vi.fn(async (id: number) => store.leads.get(id)),
  updateSalesLead: vi.fn(async (id: number, data: any) => {
    const lead = { ...store.leads.get(id), ...data };
    store.leads.set(id, lead);
    return lead;
  }),
  deleteSalesLead: vi.fn(async (id: number) => {
    store.leads.delete(id);
    return store.deletedLeadFiles;
  }),
  findLeadIdByPhoto: vi.fn(async (ref: string) => [...store.leads.values()].find((l) => (l.photos ?? []).includes(ref))?.id),
  getSalesVisit: vi.fn(async (id: number) => store.visits.get(id)),
  deleteSalesVisit: vi.fn(async (id: number) => {
    store.visits.delete(id);
    return store.deletedVisitFiles;
  }),
  findVisitIdByAudio: vi.fn(async (ref: string) => [...store.notes.values()].find((n) => n.audioUrl === ref)?.visitId),
  getSalesVisitNote: vi.fn(async (visitId: number) => store.notes.get(visitId)),
  upsertSalesVisitNote: vi.fn(async (input: any) => {
    const note = { ...store.notes.get(input.visitId), ...input };
    store.notes.set(input.visitId, note);
    return note;
  }),
  getChatIntegration: vi.fn(async () => undefined),
};

vi.mock("../server/storage.js", () => ({ storage }));
vi.mock("../server/storage-sales.js", () => ({ salesStorage: { leadSalesBatch: vi.fn(async () => new Map()) } }));
vi.mock("../server/db.js", () => ({ db: {} }));
vi.mock("../server/routes/xpot/helpers.js", () => ({
  syncLeadToGhl: vi.fn(),
  syncLeadToXphere: vi.fn(async () => ({})),
  syncVisitToGhl: vi.fn(async () => ({})),
  syncVisitToXphere: vi.fn(async () => ({})),
  getDistanceMeters: () => 0,
}));

const { createFilesRouter } = await import("../server/routes/xpot/files.js");
const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
const { createVisitsRouter } = await import("../server/routes/xpot/visits.js");
const { setFileStoresForTests } = await import("../server/lib/files.js");

const REP_A = { id: 1, userId: "user-a", displayName: "Rep A", role: "rep", isActive: true };
const REP_B = { id: 2, userId: "user-b", displayName: "Rep B", role: "rep", isActive: true };
const MANAGER = { id: 3, userId: "user-m", displayName: "Manager", role: "manager", isActive: true };

const PHOTO_A = "r2:photos/1/lead_10_1.jpg";
const LEGACY_PHOTO = "https://x.supabase.co/storage/v1/object/public/uploads/photos/1/lead_10_0.jpg";
const AUDIO_A = "r2:audio/1/visit_50_1.webm";

function appFor(userId: string, isAdmin = false) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, isAdmin };
    next();
  });
  app.use(createFilesRouter());
  app.use(createLeadsRouter());
  app.use(createVisitsRouter());
  return app;
}

type Res = { status: number; location: string | null; cacheControl: string | null; body: any };

function request(app: express.Express, method: string, path: string, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          redirect: "manual",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let parsed: any = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // redirect bodies are plain text
        }
        resolve({ status: res.status, location: res.headers.get("location"), cacheControl: res.headers.get("cache-control"), body: parsed });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

const fileUrl = (ref: string) => `/files?ref=${encodeURIComponent(ref)}`;
/** Fire-and-forget cleanups run after the response; let them settle. */
const settle = () => new Promise((r) => setTimeout(r, 20));

let r2: MemoryStore;
let pub: MemoryStore;

beforeEach(() => {
  vi.clearAllMocks();
  store.reps = new Map([[1, { ...REP_A }], [2, { ...REP_B }], [3, { ...MANAGER }]]);
  store.leads = new Map([
    [10, { id: 10, name: "A's lead", ownerRepId: 1, status: "lead", photos: [PHOTO_A, LEGACY_PHOTO] }],
    [20, { id: 20, name: "B's lead", ownerRepId: 2, status: "lead", photos: [] }],
  ]);
  store.visits = new Map([[50, { id: 50, repId: 1, leadId: 10, status: "completed" }]]);
  store.notes = new Map([[50, { visitId: 50, audioUrl: AUDIO_A }]]);
  store.deletedLeadFiles = [];
  store.deletedVisitFiles = [];
  r2 = memoryStore("r2", ["photos/1/lead_10_1.jpg", "audio/1/visit_50_1.webm"]);
  pub = memoryStore("supabase", ["photos/1/lead_10_0.jpg"]);
  setFileStoresForTests({ r2, supabase: null, public: pub });
});

describe("GET /files — signed URLs only for people who can see the lead or visit", () => {
  it("redirects the lead's owner to a short-lived signed URL", async () => {
    const res = await request(appFor("user-a"), "GET", fileUrl(PHOTO_A));
    expect(res.status).toBe(302);
    expect(res.location).toBe("https://signed.example/r2/photos/1/lead_10_1.jpg?expires=300");
    expect(res.cacheControl).toBe("private, max-age=240");
  });

  it("refuses another rep", async () => {
    const res = await request(appFor("user-b"), "GET", fileUrl(PHOTO_A));
    expect(res.status).toBe(403);
    expect(res.location).toBeNull();
  });

  it("lets a manager and a platform admin through", async () => {
    expect((await request(appFor("user-m"), "GET", fileUrl(PHOTO_A))).status).toBe(302);
    expect((await request(appFor("user-b", true), "GET", fileUrl(PHOTO_A))).status).toBe(302);
  });

  it("serves a voice note to the visit's rep and managers, not to other reps", async () => {
    const own = await request(appFor("user-a"), "GET", fileUrl(AUDIO_A));
    expect(own.status).toBe(302);
    expect(own.location).toBe("https://signed.example/r2/audio/1/visit_50_1.webm?expires=300");
    expect((await request(appFor("user-m"), "GET", fileUrl(AUDIO_A))).status).toBe(302);
    expect((await request(appFor("user-b"), "GET", fileUrl(AUDIO_A))).status).toBe(403);
  });

  it("gives nothing for a reference no lead or visit holds (no signing arbitrary keys)", async () => {
    // Rep B owns lead 20 but the key is not on it: guessing paths gets nowhere.
    const res = await request(appFor("user-b"), "GET", fileUrl("r2:photos/1/lead_10_999.jpg"));
    expect(res.status).toBe(404);
    expect(res.location).toBeNull();
  });

  it("rejects malformed references and path tricks", async () => {
    for (const ref of ["", "r2:../secrets", "r2:photos/1/../../x", "s3:photos/1/a.jpg", "r2:avatars/1/a.jpg"]) {
      const res = await request(appFor("user-a"), "GET", fileUrl(ref));
      expect(res.status, ref).toBe(400);
    }
  });

  it("keeps legacy public URLs working until they are migrated", async () => {
    const res = await request(appFor("user-a"), "GET", fileUrl(LEGACY_PHOTO));
    expect(res.status).toBe(302);
    expect(res.location).toBe(LEGACY_PHOTO);
  });

  it("requires a signed-in, active rep", async () => {
    const res = await request(appFor("nobody"), "GET", fileUrl(PHOTO_A));
    expect(res.status).not.toBe(302);
  });
});

describe("uploads go to private storage", () => {
  it("stores a photo and keeps the reference, not a public URL", async () => {
    const res = await request(appFor("user-a"), "POST", "/leads/10/photos", { imageData: "data:image/png;base64,iVBORw0KGgo=" });
    expect(res.status).toBe(200);
    expect(res.body.photo).toMatch(/^r2:photos\/1\/lead_10_\d+\.png$/);
    expect(r2.objects.has(res.body.photo.slice(3))).toBe(true);
    expect(store.leads.get(10).photos[0]).toBe(res.body.photo);
  });

  it("refuses an upload to another rep's lead", async () => {
    const res = await request(appFor("user-b"), "POST", "/leads/10/photos", { imageData: "data:image/png;base64,AA==" });
    expect(res.status).toBe(403);
    expect(r2.objects.size).toBe(2);
  });

  it("answers 503 when no private store is configured", async () => {
    setFileStoresForTests({ r2: null, supabase: null, public: null });
    const res = await request(appFor("user-a"), "POST", "/leads/10/photos", { imageData: "data:image/png;base64,AA==" });
    expect(res.status).toBe(503);
  });
});

describe("files are deleted with what they belong to", () => {
  it("removing a photo deletes the file", async () => {
    const res = await request(appFor("user-a"), "DELETE", "/leads/10/photos", { photo: PHOTO_A });
    expect(res.status).toBe(200);
    expect(res.body.lead.photos).toEqual([LEGACY_PHOTO]);
    await settle();
    expect(r2.removed).toEqual(["photos/1/lead_10_1.jpg"]);
  });

  it("removing a legacy photo deletes it from the public bucket (old field name still accepted)", async () => {
    await request(appFor("user-a"), "DELETE", "/leads/10/photos", { photoUrl: LEGACY_PHOTO });
    await settle();
    expect(pub.removed).toEqual(["photos/1/lead_10_0.jpg"]);
  });

  it("does not delete a file the lead doesn't hold", async () => {
    // Rep A owns lead 10 but asks to remove a photo of some other lead.
    const res = await request(appFor("user-a"), "DELETE", "/leads/10/photos", { photo: "r2:photos/2/lead_20_1.jpg" });
    expect(res.status).toBe(200);
    await settle();
    expect(r2.removed).toEqual([]);
  });

  it("another rep can't remove the photo", async () => {
    const res = await request(appFor("user-b"), "DELETE", "/leads/10/photos", { photo: PHOTO_A });
    expect(res.status).toBe(403);
    await settle();
    expect(r2.removed).toEqual([]);
  });

  it("deleting a lead deletes its photos and voice notes", async () => {
    store.deletedLeadFiles = [PHOTO_A, LEGACY_PHOTO, AUDIO_A];
    const res = await request(appFor("user-a"), "DELETE", "/leads/10");
    expect(res.status).toBe(204);
    await settle();
    expect(r2.removed.sort()).toEqual(["audio/1/visit_50_1.webm", "photos/1/lead_10_1.jpg"]);
    expect(pub.removed).toEqual(["photos/1/lead_10_0.jpg"]);
  });

  it("deleting a visit deletes its voice note", async () => {
    store.deletedVisitFiles = [AUDIO_A];
    const res = await request(appFor("user-a"), "DELETE", "/visits/50");
    expect(res.status).toBe(204);
    await settle();
    expect(r2.removed).toEqual(["audio/1/visit_50_1.webm"]);
  });

  it("a storage failure is logged, and the delete still succeeds", async () => {
    store.deletedLeadFiles = [PHOTO_A];
    r2.failRemove = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(appFor("user-a"), "DELETE", "/leads/10");
    expect(res.status).toBe(204);
    await settle();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("lead #10 deleted"), "storage is down", ["photos/1/lead_10_1.jpg"]);
    errors.mockRestore();
  });

  it("recording a voice note again deletes the previous one", async () => {
    const res = await request(appFor("user-a"), "POST", "/visits/50/audio", { audioData: "data:audio/webm;base64,GkXfow==", durationSeconds: 3 });
    expect(res.status).toBe(200);
    expect(res.body.note.audioUrl).toMatch(/^r2:audio\/1\/visit_50_\d+\.webm$/);
    await settle();
    expect(r2.removed).toEqual(["audio/1/visit_50_1.webm"]);
    expect(r2.objects.has(res.body.note.audioUrl.slice(3))).toBe(true);
  });
});
