import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpCaller } from "../server.js";
import { db } from "../../db.js";
import { users } from "#shared/schema.js";
import { repModules } from "#shared/modules.js";
import { customerOrderCreateSchema } from "#shared/customerOrders.js";
import { storage } from "../../storage.js";
import { membershipsForRep } from "../../organizations/service.js";
import { accessDenial } from "../../routes/xpot/middleware.js";
import type { TagActor } from "#shared/tagAccess.js";
import * as orders from "../../customerOrders/service.js";
import { orderCommandSchemas } from "../../customerOrders/routes.js";

export async function orderActorForCaller(
  caller: McpCaller,
): Promise<TagActor> {
  if (!caller.userId) throw new orders.OrderError("order_user_required", 403);
  const rep = await storage.getSalesRepByUserId(caller.userId);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, caller.userId));
  if (
    !rep ||
    !user ||
    accessDenial(rep) ||
    (!user.isAdmin && !repModules(rep).includes("tags"))
  )
    throw new orders.OrderError("order_forbidden", 403);
  const memberships = (await membershipsForRep(rep.id)).filter(
    (m) => m.isActive && !m.blockedAt,
  );
  return {
    userId: user.id,
    repId: rep.id,
    isManager: Boolean(user.isAdmin),
    inManagement: Boolean(user.isAdmin),
    organizationIds: memberships.map((m) => m.organizationId),
    managedOrganizationIds: memberships
      .filter((m) => m.role === "admin")
      .map((m) => m.organizationId),
  };
}
export function registerCustomerOrderTools(
  server: McpServer,
  caller: McpCaller,
) {
  async function run(body: (actor: TagActor) => Promise<unknown>) {
    try {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await body(await orderActorForCaller(caller))),
          },
        ],
      };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              e instanceof orders.OrderError
                ? e.code
                : e instanceof z.ZodError
                  ? "order_input_invalid"
                  : "order_failed",
          },
        ],
      };
    }
  }
  server.tool(
    "customer_orders_list",
    "Read customer orders visible to the linked user. all=true includes authorized team/producer orders. Paginated; no stock or sale mutation.",
    {
      leadId: z.number().int().positive().optional(),
      all: z.boolean().default(false),
      work: z.enum(["open", "attention", "all"]).default("open"),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().nonnegative().default(0),
    },
    (input) => run((actor) => orders.listOrders(actor, input)),
  );
  server.tool(
    "customer_order_get",
    "Read one authorized order with line balances, delivery sales, artwork approval and unused credit.",
    { id: z.string().uuid() },
    ({ id }) => run((actor) => orders.getOrder(id, actor)),
  );
  server.tool(
    "customer_order_create",
    "Record a customer request; creates no sale. A won deal may be converted once via opportunityId. Use a stable idempotencyKey.",
    {
      input: customerOrderCreateSchema,
      idempotencyKey: z.string().min(8).max(120),
    },
    ({ input, idempotencyKey }) =>
      run((actor) => orders.createOrder(input, actor, idempotencyKey)),
  );
  server.tool(
    "customer_order_catalog",
    "Read public orderable models and products; custom models stay private.",
    {},
    () => run((actor) => orders.orderCatalog(actor)),
  );
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
  for (const name of Object.keys(commands) as Array<keyof typeof commands>) {
    server.tool(
      `customer_order_${name}`,
      "Apply this order command using the current revision and a stable idempotencyKey. Same permissions and transaction as the app. Deliver creates ONE sale for selected pieces. Payments record completed money movements only; refunds/retention require an owner. Never invent customer approval or physical return.",
      {
        id: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(120),
        input: orderCommandSchemas[name],
      },
      ({ id, idempotencyKey, input }) =>
        run((actor) =>
          (
            commands[name] as (
              id: string,
              actor: TagActor,
              key: string,
              input: any,
            ) => Promise<unknown>
          )(id, actor, idempotencyKey, input),
        ),
    );
  }
}
