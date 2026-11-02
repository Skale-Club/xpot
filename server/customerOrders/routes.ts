import type { Express } from "express";
import { z } from "zod";
import { customerOrderCreateSchema } from "#shared/customerOrders.js";
import { PRINT_MAX_PLATES } from "#shared/printProduction.js";
import { actorOf, requireTagUser } from "../tags/access.js";
import * as orders from "./service.js";
import { TagSaleError } from "../tags/sales.js";
import { TagError } from "../tags/errors.js";

const revision = z.number().int().positive();
const reason = z.string().trim().min(3).max(1000);
const cents = z.number().int().nonnegative().max(100_000_000);
const tagIds = z.array(z.string().uuid()).min(1).max(50);
const method = z.enum(["cash", "card", "pix", "transfer", "invoice", "other"]);
export const orderCommandSchemas = {
  allocate: z.object({ revision, lineId: z.string().uuid(), tagIds }).strict(),
  produce: z
    .object({
      revision,
      lineId: z.string().uuid(),
      quantity: z.number().int().positive().max(PRINT_MAX_PLATES).optional(),
    })
    .strict(),
  dispatch: z
    .object({
      revision,
      lineId: z.string().uuid(),
      tagIds,
      unitCostCents: cents.optional(),
    })
    .strict(),
  model: z
    .object({ revision, lineId: z.string().uuid(), modelId: z.string().uuid() })
    .strict(),
  deliver: z
    .object({
      revision,
      tagIds,
      paymentStatus: z.enum(["paid", "partial", "unpaid"]),
      paidCents: cents.optional(),
      applyCreditCents: cents.default(0),
      paymentMethod: method.optional(),
    })
    .strict(),
  change: z
    .object({
      revision,
      lineId: z.string().uuid().optional(),
      quantity: z.number().int().min(1).max(1000).optional(),
      unitPriceCents: cents.optional(),
      repId: z.number().int().positive().optional(),
      reason,
    })
    .strict(),
  cancel: z.object({ revision, reason }).strict(),
  release: z.object({ revision, tagIds, reason }).strict(),
  payments: z
    .object({
      revision,
      kind: z.enum(["received", "refund", "retained"]),
      amountCents: cents.refine((v) => v > 0),
      paymentMethod: method.optional(),
      referenceId: z.string().uuid().optional(),
      reason,
    })
    .strict(),
  reverse: z
    .object({
      revision,
      deliveryId: z.string().uuid(),
      returned: z.boolean(),
      reason,
    })
    .strict(),
  settle: z
    .object({
      revision,
      deliveryId: z.string().uuid(),
      cashCents: cents,
      applyCreditCents: cents,
      paymentMethod: method.optional(),
    })
    .strict(),
  artwork: z
    .object({
      revision,
      lineId: z.string().uuid(),
      description: reason,
      kind: z.enum(["brief", "proof"]),
      file: z
        .object({
          filename: z.string().max(160),
          contentType: z.string().max(100),
          data: z.string().max(11_200_000),
        })
        .strict()
        .optional(),
    })
    .strict(),
  approve: z
    .object({
      revision,
      artworkId: z.string().uuid(),
      approvedBy: z.string().trim().min(1).max(160),
      approvalMethod: z.string().trim().min(1).max(160),
      modelId: z.string().uuid().optional(),
    })
    .strict(),
};
function answerError(res: import("express").Response, error: unknown) {
  if (error instanceof orders.OrderError)
    return res
      .status(error.status)
      .json({ code: error.code, message: error.code });
  if (error instanceof TagSaleError || error instanceof TagError)
    return res
      .status(error.status)
      .json({
        code: error.code ?? "order_failed",
        message: error.code ?? "order_failed",
      });
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({
        code: "order_input_invalid",
        message: "order_input_invalid",
        details: error.flatten(),
      });
  const cause =
    (error as { cause?: { message?: string }; message?: string })?.cause
      ?.message ??
    (error as Error)?.message ??
    "";
  if (cause.includes("order_piece_allocated"))
    return res
      .status(409)
      .json({
        code: "order_piece_allocated",
        message: "order_piece_allocated",
      });
  if ((error as { code?: string })?.code?.startsWith("tag_"))
    return res
      .status((error as { status?: number }).status ?? 409)
      .json({
        code: (error as { code: string }).code,
        message: (error as Error).message,
      });
  console.error("[customer-orders]", error);
  return res
    .status(500)
    .json({ code: "order_failed", message: "order_failed" });
}
export function registerCustomerOrderRoutes(app: Express) {
  const base = "/api/xpot/customer-orders";
  app.use(base, requireTagUser);
  app.get(`${base}/catalog`, async (req, res) => {
    try {
      res.json(await orders.orderCatalog(actorOf(req)));
    } catch (e) {
      answerError(res, e);
    }
  });
  app.get(base, async (req, res) => {
    try {
      const options = z
        .object({
          leadId: z.coerce.number().int().positive().optional(),
          all: z.enum(["true", "false"]).optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          offset: z.coerce.number().int().nonnegative().optional(),
          work: z.enum(["open", "attention", "all"]).optional(),
        })
        .parse(req.query);
      res
        .set("Cache-Control", "private, no-store")
        .json(
          await orders.listOrders(actorOf(req), {
            ...options,
            all: options.all === "true",
          }),
        );
    } catch (e) {
      answerError(res, e);
    }
  });
  app.get(`${base}/:id/candidates/:lineId`, async (req, res) => {
    try {
      res.json(
        await orders.orderCandidates(
          z.string().uuid().parse(req.params.id),
          z.string().uuid().parse(req.params.lineId),
          actorOf(req),
          z
            .string()
            .max(80)
            .parse(req.query.search ?? ""),
        ),
      );
    } catch (e) {
      answerError(res, e);
    }
  });
  app.get(`${base}/:id/assignees`, async (req, res) => {
    try {
      res.json(
        await orders.orderAssignees(
          z.string().uuid().parse(req.params.id),
          actorOf(req),
        ),
      );
    } catch (e) {
      answerError(res, e);
    }
  });
  app.get(`${base}/:id/models/:lineId`, async (req, res) => {
    try {
      res.json(
        await orders.orderDesignModels(
          z.string().uuid().parse(req.params.id),
          z.string().uuid().parse(req.params.lineId),
          actorOf(req),
        ),
      );
    } catch (e) {
      answerError(res, e);
    }
  });
  app.post(base, async (req, res) => {
    try {
      const result = await orders.createOrder(
        customerOrderCreateSchema.parse(req.body),
        actorOf(req),
        req.get("idempotency-key") ?? "",
      );
      res.location(`${base}/${result.id}`).status(201).json(result);
    } catch (e) {
      answerError(res, e);
    }
  });
  app.get(`${base}/:id`, async (req, res) => {
    try {
      res
        .set("Cache-Control", "private, no-store")
        .json(
          await orders.getOrder(
            z.string().uuid().parse(req.params.id),
            actorOf(req),
          ),
        );
    } catch (e) {
      answerError(res, e);
    }
  });
  const commands = {
    allocate: orders.allocateOrder,
    produce: orders.produceOrder,
    dispatch: orders.dispatchOrder,
    model: orders.linkOrderModel,
    deliver: orders.deliverOrder,
    change: orders.changeOrder,
    cancel: orders.cancelOrder,
    release: orders.releaseOrderPieces,
    payments: orders.recordOrderPayment,
    reverse: orders.reverseOrderDelivery,
    settle: orders.settleOrderDelivery,
    artwork: orders.addOrderArtwork,
    approve: orders.approveOrderArtwork,
  };
  for (const name of Object.keys(commands) as Array<keyof typeof commands>)
    app.post(`${base}/:id/${name}`, async (req, res) => {
      try {
        const id = z.string().uuid().parse(req.params.id);
        const input = orderCommandSchemas[name].parse(req.body);
        const run = commands[name] as (
          id: string,
          actor: ReturnType<typeof actorOf>,
          key: string,
          input: any,
        ) => Promise<unknown>;
        res.json(
          await run(id, actorOf(req), req.get("idempotency-key") ?? "", input),
        );
      } catch (e) {
        answerError(res, e);
      }
    });
  app.get(`${base}/:id/artwork/:artworkId/file`, async (req, res) => {
    try {
      const file = await orders.readOrderArtwork(
        z.string().uuid().parse(req.params.id),
        z.string().uuid().parse(req.params.artworkId),
        actorOf(req),
      );
      res
        .set({
          "Content-Type": file.contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "Content-Disposition": `${file.contentType === "application/pdf" ? "attachment" : "inline"}; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        })
        .send(Buffer.from(file.body));
    } catch (e) {
      answerError(res, e);
    }
  });
}
