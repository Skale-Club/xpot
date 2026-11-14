import type { Express, Request, Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { tagShowcaseItems, type TagShowcaseRow } from "#shared/schema.js";
import {
  tagShowcaseInputSchema,
  tagShowcasePatchSchema,
  showcaseInLanguage,
  showcaseUrl,
  type TagShowcaseInput,
  type TagShowcaseItem,
  type TagShowcaseView,
} from "#shared/tagShowcase.js";
import { requireTagAdmin, requireTagUser } from "./access.js";

// Tags › Shop. Xpot sells nothing: the Stuscle store is the sales engine, so a showcase entry only describes a piece
// model or a ready-made kit and sends the reseller there. The Xpot admin keeps the entries; every signed-in Tags user
// reads the published ones, each with a link to Xpot's open route, which signs the reader's own wholesale code on the
// click (an entry with SKUs fills the cart, one without opens the wholesale page). No link carries the code itself. The price that counts is Stuscle's; `referencePriceCents` is only typed-in information.

function toItem(row: TagShowcaseRow): TagShowcaseItem {
  return {
    id: row.id,
    kind: row.kind === "kit" ? "kit" : "model",
    title: row.title,
    description: row.description,
    includes: row.includes ?? [],
    imageUrl: row.imageUrl,
    items: row.items ?? [],
    translations: row.translations ?? {},
    referencePriceCents: row.referencePriceCents,
    currency: row.currency,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ordered = [asc(tagShowcaseItems.sortOrder), desc(tagShowcaseItems.createdAt)] as const;

export async function listShowcase(opts: { publishedOnly: boolean }): Promise<TagShowcaseItem[]> {
  const query = db.select().from(tagShowcaseItems);
  const rows = await (opts.publishedOnly ? query.where(eq(tagShowcaseItems.isPublished, true)) : query).orderBy(...ordered);
  return rows.map(toItem);
}

export async function listShowcaseForReader(lang?: string | null): Promise<TagShowcaseView[]> {
  const items = await listShowcase({ publishedOnly: true });
  return items.map((item) => ({ ...showcaseInLanguage(item, lang), url: showcaseUrl(item) }));
}

function values(input: TagShowcaseInput) {
  return {
    kind: input.kind,
    title: input.title,
    description: input.description ?? null,
    includes: input.includes,
    imageUrl: input.imageUrl ?? null,
    items: input.items,
    translations: input.translations,
    referencePriceCents: input.referencePriceCents ?? null,
    sortOrder: input.sortOrder,
    isPublished: input.isPublished,
  };
}

export async function createShowcaseItem(input: TagShowcaseInput, userId: string | null): Promise<TagShowcaseItem> {
  const [row] = await db.insert(tagShowcaseItems).values({ ...values(input), createdByUserId: userId }).returning();
  return toItem(row);
}

/** A patch is merged over the stored entry and the result validated whole, so a kit can never end up without SKUs. */
export async function updateShowcaseItem(id: string, patch: Partial<TagShowcaseInput>): Promise<TagShowcaseItem | null> {
  const [current] = await db.select().from(tagShowcaseItems).where(eq(tagShowcaseItems.id, id)).limit(1);
  if (!current) return null;
  const merged = tagShowcaseInputSchema.parse({ ...toInput(toItem(current)), ...patch });
  const [row] = await db.update(tagShowcaseItems).set({ ...values(merged), updatedAt: new Date() }).where(eq(tagShowcaseItems.id, id)).returning();
  return toItem(row);
}

export async function deleteShowcaseItem(id: string): Promise<boolean> {
  const rows = await db.delete(tagShowcaseItems).where(eq(tagShowcaseItems.id, id)).returning({ id: tagShowcaseItems.id });
  return rows.length > 0;
}

function toInput(item: TagShowcaseItem): TagShowcaseInput {
  return {
    kind: item.kind,
    title: item.title,
    description: item.description,
    includes: item.includes,
    imageUrl: item.imageUrl,
    items: item.items,
    translations: item.translations,
    referencePriceCents: item.referencePriceCents,
    sortOrder: item.sortOrder,
    isPublished: item.isPublished,
  };
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues[0]?.message ?? "Validation error", errors: err.errors });
  console.error(`[tags] ${fallback}:`, err);
  return res.status(500).json({ message: fallback });
}

function idParam(req: Request, res: Response): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) {
    res.status(404).json({ message: "Not found" });
    return null;
  }
  return parsed.data;
}

export function registerShowcaseRoutes(app: Express) {
  // Any signed-in Tags user: the published entries, each with its link to Xpot's open route (no code in it).
  app.get("/api/xpot/tags/showcase", requireTagUser, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      // ?lang= is the reader's language in the app (pt, es); anything else reads the main text.
      res.json(await listShowcaseForReader(typeof req.query.lang === "string" ? req.query.lang : null));
    } catch (err) {
      fail(res, err, "Failed to load the shop");
    }
  });

  // The Xpot admin keeps the entries (every one, published or not).
  app.get("/api/xpot/admin/tag-showcase", requireTagAdmin, async (_req, res) => {
    try {
      res.json(await listShowcase({ publishedOnly: false }));
    } catch (err) {
      fail(res, err, "Failed to load the shop entries");
    }
  });

  app.post("/api/xpot/admin/tag-showcase", requireTagAdmin, async (req, res) => {
    try {
      const input = tagShowcaseInputSchema.parse(req.body);
      res.status(201).json(await createShowcaseItem(input, (req.session as { userId?: string } | undefined)?.userId ?? null));
    } catch (err) {
      fail(res, err, "Failed to save the shop entry");
    }
  });

  app.patch("/api/xpot/admin/tag-showcase/:id", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const patch = tagShowcasePatchSchema.parse(req.body);
      const item = await updateShowcaseItem(id, patch as Partial<TagShowcaseInput>);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err) {
      fail(res, err, "Failed to save the shop entry");
    }
  });

  app.delete("/api/xpot/admin/tag-showcase/:id", requireTagAdmin, async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      if (!(await deleteShowcaseItem(id))) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, "Failed to delete the shop entry");
    }
  });
}
