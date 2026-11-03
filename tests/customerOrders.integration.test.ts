// Destructive fixtures, disposable migrated Postgres only. Included in CI's serial integration pass.
import { test, expect } from "vitest";
import express from "express";
import "express-async-errors";
import { randomUUID } from "node:crypto";
import {
  PRINT_PREVIEW_CATALOG_PATH,
  printModelPreviewPath,
} from "../shared/printProduction.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const enabled = process.env.TAGS_INTEGRATION === "1";
test.skipIf(!enabled)(
  "customer orders: restaurant, concurrency, production, money, artwork and scope over HTTP",
  async () => {
    const { db, pool } = await import("../server/db.js");
    const { sql } = await import("drizzle-orm");
    const { registerTagRoutes } = await import("../server/tags/routes.js");
    const { createSalesRouter } = await import(
      "../server/routes/xpot/sales.js"
    );
    const production = await import("../server/tags/production.js");
    const { memoryStore } = await import("./helpers/memoryStore.js");
    const { setFileStoresForTests } = await import("../server/lib/files.js");
    const store = memoryStore("r2");
    setFileStoresForTests({ r2: store, supabase: null, public: null });
    const one = async (query: ReturnType<typeof sql>) =>
      (await db.execute(query)).rows[0] as any;
    await db.execute(
      sql`TRUNCATE tags,sales_leads,users,print_models,sales_products CASCADE`,
    );
    await db.execute(
      sql`INSERT INTO users(id,email,is_admin) VALUES('co-admin','admin@co.test',true),('co-seller','seller@co.test',false),('co-other','other@co.test',false)`,
    );
    const reps = (
      await db.execute(sql`INSERT INTO sales_reps(user_id,display_name,role,is_active,modules,cost_policy,cost_policy_configured_at) VALUES
    ('co-admin','CO Owner','admin',true,ARRAY['tags','visits'],'zero',now()),('co-seller','CO Seller','rep',true,ARRAY['tags'],'zero',now()),('co-other','CO Other','rep',true,ARRAY['tags'],'zero',now()) RETURNING id,user_id`)
    ).rows as any[];
    const rep = Object.fromEntries(reps.map((r) => [r.user_id, r.id]));
    const org = (
      await one(
        sql`INSERT INTO organizations(name,slug,prints_own_pieces) VALUES('CO Company','xpot-company',true) RETURNING id`,
      )
    ).id;
    await db.execute(
      sql`INSERT INTO organization_memberships(organization_id,rep_id,role,is_active) VALUES(${org},${rep["co-admin"]},'admin',true),(${org},${rep["co-seller"]},'member',true),(${org},${rep["co-other"]},'member',true)`,
    );
    const lead = (
      await one(
        sql`INSERT INTO sales_leads(organization_id,name,owner_rep_id,source,status) VALUES(${org},'CO Restaurant',${rep["co-seller"]},'field','lead') RETURNING id`,
      )
    ).id;
    const product = (
      await one(
        sql`INSERT INTO sales_products(sku,name,kind,base_price_cents,currency,is_active) VALUES('CO-PLATE','CO Plate','physical',1000,'USD',true) RETURNING id`,
      )
    ).id;
    const model = (
      await one(
        sql`INSERT INTO print_models(slug,title,kind,product_type,face,sales_product_id,batch_prefix,status) VALUES('co-plate','CO Plate','serialized','large_plate','menu',${product},'COTEST','ready') RETURNING id`,
      )
    ).id;
    const version = (
      await one(
        sql`INSERT INTO print_model_versions(model_id,version,builder,params,recipe,beds) VALUES(${model},1,'plate.menu','{}','{}','[{"label":"x4","copies":4}]') RETURNING id`,
      )
    ).id;
    await db.execute(
      sql`UPDATE print_models SET current_version_id=${version} WHERE id=${model}`,
    );
    const batch = (
      await one(
        sql`INSERT INTO tag_batches(organization_id,name,batch_code,product_type,sales_product_id,face,quantity,status) VALUES(${org},'CO Free','CO-FREE','large_plate',${product},'menu',10,'open') RETURNING id`,
      )
    ).id;
    const free = (
      await db.execute(
        sql`INSERT INTO tags(organization_id,public_code,product_type,sales_product_id,face,batch_id,rep_id,status,stock_status) SELECT ${org},'COFREE'||n,'large_plate',${product},'menu',${batch},${rep["co-seller"]},'inventory','available' FROM generate_series(1,10) n RETURNING id,public_code`,
      )
    ).rows as any[];
    const app = express();
    app.use(express.json({ limit: "8mb" }));
    app.use((req, _res, next) => {
      const userId = req.get("x-test-user");
      (req as any).session = userId
        ? { userId, email: `${userId}@co.test`, isAdmin: userId === "co-admin" }
        : {};
      next();
    });
    const { handleMcpRequest } = await import("../server/mcp/server.js");
    app.post("/co-mcp", (req, res) =>
      handleMcpRequest(req, res, {
        kind: "oauth",
        id: "test-order",
        label: "orders-integration",
        userId: req.get("x-test-user") ?? null,
        scopes: [req.get("x-test-scope") ?? "xpot:orders"],
      }),
    );
    registerTagRoutes(app);
    app.use("/api/xpot", createSalesRouter());
    app.use((err: any, _req: any, res: any, _next: any) =>
      res
        .status(err.status ?? 500)
        .json({ code: err.code, message: err.message }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`,
      path = "/api/xpot/customer-orders";
    async function call(
      method: string,
      url: string,
      body?: unknown,
      user = "co-seller",
      key = randomUUID(),
    ) {
      const res = await fetch(base + url, {
        method,
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "x-test-user": user,
          "Idempotency-Key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: res.status, data };
    }
    const createBody = {
      leadId: lead,
      currency: "USD",
      lines: [
        {
          description: "10 menu plates",
          quantity: 10,
          salesProductId: product,
          productType: "large_plate",
          face: "menu",
          unitPriceCents: 1000,
          modelId: model,
          custom: false,
        },
      ],
    };
    async function command(
      order: any,
      name: string,
      body: Record<string, unknown>,
      user = "co-seller",
      key = randomUUID(),
    ) {
      const result = await call(
        "POST",
        `${path}/${order.id}/${name}`,
        { revision: order.revision, ...body },
        user,
        key,
      );
      expect(result.status, JSON.stringify(result.data)).toBe(200);
      return result.data;
    }
    try {
      // Missing auth, wrong user, duplicate create, unknown fields and stale revisions.
      expect((await fetch(base + path)).status).toBe(401);
      expect((await call("GET", `${path}/catalog`)).status).toBe(200);
      const createKey = randomUUID(),
        pair = await Promise.all([
          call("POST", path, createBody, "co-seller", createKey),
          call("POST", path, createBody, "co-seller", createKey),
        ]);
      expect(pair.map((r) => r.status)).toEqual([201, 201]);
      expect(pair[0].data.id).toBe(pair[1].data.id);
      let order = pair[0].data;
      expect(
        (await call("GET", `${path}/${order.id}`, undefined, "co-other"))
          .status,
      ).toBe(404);
      expect(
        (await call("POST", path, { ...createBody, repId: rep["co-admin"] }))
          .status,
      ).toBe(400);
      expect(
        (
          await call(
            "POST",
            path,
            { ...createBody, notes: "different" },
            "co-seller",
            createKey,
          )
        ).status,
      ).toBe(409);
      order = await command(order, "allocate", {
        lineId: order.lines[0].id,
        tagIds: free.slice(0, 2).map((p) => p.id),
      });
      expect([
        order.lines[0].allocated,
        order.lines[0].toProduce,
        order.lines[0].delivered,
      ]).toEqual([2, 8, 0]);
      expect(
        (
          await one(
            sql`SELECT count(*)::int AS n FROM sales_sales WHERE lead_id=${lead}`,
          )
        ).n,
      ).toBe(0);
      expect(
        (
          await one(
            sql`SELECT count(*)::int AS n FROM sales_tasks WHERE customer_order_id=${order.id}`,
          )
        ).n,
      ).toBe(1);
      await expect(
        db.execute(sql`UPDATE tags SET status='active' WHERE id=${free[0].id}`),
      ).rejects.toThrow();
      await expect(
        db.execute(
          sql`UPDATE tags SET stock_status='sold' WHERE id=${free[0].id}`,
        ),
      ).rejects.toThrow();
      const stale = await call("POST", `${path}/${order.id}/cancel`, {
        revision: 1,
        reason: "stale request",
      });
      expect(stale.data.code).toBe("order_revision_conflict");
      // A signal is a receipt, not revenue. Two delivered pieces create one sale and leave eight requested.
      order = await command(order, "payments", {
        kind: "received",
        amountCents: 3000,
        paymentMethod: "cash",
        reason: "Restaurant deposit",
      });
      const deliveryKey = randomUUID(),
        deliveryBody = {
          revision: order.revision,
          tagIds: free.slice(0, 2).map((p) => p.id),
          paymentStatus: "paid",
          applyCreditCents: 2000,
        };
      const deliveries = await Promise.all([
        call(
          "POST",
          `${path}/${order.id}/deliver`,
          deliveryBody,
          "co-seller",
          deliveryKey,
        ),
        call(
          "POST",
          `${path}/${order.id}/deliver`,
          deliveryBody,
          "co-seller",
          deliveryKey,
        ),
      ]);
      expect(deliveries.map((r) => r.status)).toEqual([200, 200]);
      order = deliveries[0].data;
      expect([
        order.lines[0].delivered,
        order.lines[0].remaining,
        order.lines[0].toProduce,
        order.creditCents,
      ]).toEqual([2, 8, 8, 1000]);
      expect(order.deliveries.length).toBe(1);
      const sale = await one(
        sql`SELECT * FROM sales_sales WHERE id=${order.deliveries[0].saleId}`,
      );
      expect([sale.total_cents, sale.paid_cents]).toEqual([2000, 2000]);
      expect(
        (
          await call(
            "PATCH",
            `/api/xpot/sales/${sale.id}/payment`,
            { paymentStatus: "unpaid" },
            "co-admin",
          )
        ).data.code,
      ).toBe("order_payment_required");
      expect(
        (
          await call(
            "POST",
            `/api/xpot/sales/${sale.id}/cancel`,
            { reason: "wrong route" },
            "co-admin",
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await call("POST", `${path}/${order.id}/cancel`, {
            revision: order.revision,
            reason: "cancel with credit",
          })
        ).status,
      ).toBe(403);
      // Production intake allocates good pieces; damaged pieces still need replacing.
      expect(order.lines[0].plateCapacity).toBe(4);
      const oversized = await call("POST", `${path}/${order.id}/produce`, { revision: order.revision, lineId: order.lines[0].id, quantity: 8 });
      expect(oversized.status).toBe(409);
      expect(oversized.data.code).toBe("order_quantity_exceeded");
      for (let round = 0; round < 2; round++) {
        order = await command(order, "produce", { lineId: order.lines[0].id });
        expect(order.lines[0].pending).toBe(4);
        const duplicate = await call("POST", `${path}/${order.id}/produce`, { revision: order.revision, lineId: order.lines[0].id });
        expect(duplicate.status).toBe(409);
        expect(duplicate.data.code).toBe("order_production_pending");
        const jobs = (
        await db.execute(
          sql`SELECT j.* FROM print_jobs j JOIN print_requests r ON r.id=j.request_id WHERE r.customer_order_line_id=${order.lines[0].id} AND j.status='requested' ORDER BY j.plate_number`,
        )
        ).rows as any[];
        expect(jobs).toHaveLength(1);
        for (const job of jobs) {
        await db.execute(
          sql`UPDATE print_jobs SET status='printing' WHERE id=${job.id}`,
        );
        const bad =
          round === 0
            ? (
                await one(
                  sql`SELECT public_code FROM tags WHERE batch_id=${job.batch_id} ORDER BY id LIMIT 1`,
                )
              ).public_code
            : undefined;
        await production.transitionJob(
          job.id,
          {
            action: "printed",
            userId: "co-admin",
            badPieces: bad ? [bad] : [],
          },
          null,
        );
        }
        order = (await call("GET", `${path}/${order.id}`)).data;
      }
      expect([
        order.lines[0].allocated,
        order.lines[0].pending,
        order.lines[0].toProduce,
      ]).toEqual([7, 0, 1]);
      expect(
        (
          await one(
            sql`SELECT count(*)::int AS n FROM sales_tasks WHERE customer_order_id=${order.id}`,
          )
        ).n,
      ).toBe(1);
      // Cancellation keeps the delivered bill, releases allocations and leaves deposit handling explicit.
      order = await command(
        order,
        "cancel",
        { reason: "Customer cancelled remaining eight" },
        "co-admin",
      );
      expect(order.workState).toBe("partially_cancelled");
      expect(order.creditCents).toBe(1000);
      expect(
        (await one(sql`SELECT status FROM sales_sales WHERE id=${sale.id}`))
          .status,
      ).toBe("completed");
      expect(
        (
          await one(
            sql`SELECT count(*)::int AS n FROM tags WHERE customer_order_line_id=${order.lines[0].id}`,
          )
        ).n,
      ).toBe(0);
      const receipt = order.payments.find((p: any) => p.kind === "received");
      expect(
        (
          await call(
            "POST",
            `${path}/${order.id}/payments`,
            {
              revision: order.revision,
              kind: "refund",
              amountCents: 1001,
              referenceId: receipt.id,
              reason: "over refund",
            },
            "co-admin",
          )
        ).status,
      ).toBe(409);
      order = await command(
        order,
        "payments",
        {
          kind: "refund",
          amountCents: 1000,
          referenceId: receipt.id,
          reason: "Refund actually completed",
        },
        "co-admin",
      );
      expect(order.creditCents).toBe(0);
      order = await command(
        order,
        "reverse",
        {
          deliveryId: order.deliveries[0].id,
          returned: true,
          reason: "Both physical pieces returned",
        },
        "co-admin",
      );
      expect(order.creditCents).toBe(2000);
      order = await command(
        order,
        "payments",
        {
          kind: "retained",
          amountCents: 2000,
          referenceId: receipt.id,
          reason: "Owner recorded agreed retention",
        },
        "co-admin",
      );
      expect(order.creditCents).toBe(0);
      // Later receipt settles an unpaid delivery without a second sale.
      let later = (
        await call("POST", path, {
          ...createBody,
          lines: [{ ...createBody.lines[0], quantity: 1 }],
        })
      ).data;
      later = await command(later, "allocate", {
        lineId: later.lines[0].id,
        tagIds: [free[2].id],
      });
      later = await command(later, "deliver", {
        tagIds: [free[2].id],
        paymentStatus: "unpaid",
        applyCreditCents: 0,
      });
      later = await command(later, "settle", {
        deliveryId: later.deliveries[0].id,
        cashCents: 1000,
        applyCreditCents: 0,
        paymentMethod: "cash",
      });
      expect(later.deliveries[0].paidCents).toBe(1000);
      expect(later.deliveries.length).toBe(1);
      expect(later.creditCents).toBe(0);
      // Two independent orders cannot reserve the same unit, even with different keys.
      const a = (await call("POST", path, createBody)).data,
        b = (await call("POST", path, createBody)).data;
      const raced = await Promise.all([
        call("POST", `${path}/${a.id}/allocate`, {
          revision: a.revision,
          lineId: a.lines[0].id,
          tagIds: [free[3].id],
        }),
        call("POST", `${path}/${b.id}/allocate`, {
          revision: b.revision,
          lineId: b.lines[0].id,
          tagIds: [free[3].id],
        }),
      ]);
      expect(raced.map((r) => r.status).sort()).toEqual([200, 409]);
      const reserved = raced.find((r) => r.status === 200)!.data;
      const beforeFailedSale = Number(
        (await one(sql`SELECT count(*) AS n FROM sales_sales`)).n,
      );
      await db.execute(
        sql`UPDATE sales_reps SET cost_policy_configured_at=NULL WHERE id=${rep["co-seller"]}`,
      );
      const failedSale = await call("POST", `${path}/${reserved.id}/deliver`, {
        revision: reserved.revision,
        tagIds: [free[3].id],
        paymentStatus: "unpaid",
        applyCreditCents: 0,
      });
      expect(failedSale.status).toBe(409);
      expect(failedSale.data.code).toBe("seller_cost_policy_unconfigured");
      expect(
        (
          await one(
            sql`SELECT customer_order_line_id FROM tags WHERE id=${free[3].id}`,
          )
        ).customer_order_line_id,
      ).toBe(reserved.lines[0].id);
      expect(
        Number((await one(sql`SELECT count(*) AS n FROM sales_sales`)).n),
      ).toBe(beforeFailedSale);
      await db.execute(
        sql`UPDATE sales_reps SET cost_policy_configured_at=now() WHERE id=${rep["co-seller"]}`,
      );
      // Private art: a seller records instructions and actual approval; only platform creates proof/model.
      let custom = (
        await call("POST", path, {
          ...createBody,
          lines: [
            {
              ...createBody.lines[0],
              quantity: 1,
              modelId: undefined,
              custom: true,
            },
          ],
        })
      ).data;
      expect(
        (
          await call("POST", `${path}/${custom.id}/produce`, {
            revision: custom.revision,
            lineId: custom.lines[0].id,
          })
        ).status,
      ).toBe(409);
      custom = await command(custom, "artwork", {
        lineId: custom.lines[0].id,
        kind: "brief",
        description: "Restaurant name in gold",
      });
      expect(
        (
          await call("POST", `${path}/${custom.id}/artwork`, {
            revision: custom.revision,
            lineId: custom.lines[0].id,
            kind: "proof",
            description: "unapproved proof",
          })
        ).status,
      ).toBe(403);
      custom = await command(
        custom,
        "artwork",
        {
          lineId: custom.lines[0].id,
          kind: "proof",
          description: "Approved layout candidate",
        },
        "co-admin",
      );
      custom = await command(custom, "approve", {
        artworkId: custom.lines[0].artwork.at(-1).id,
        approvedBy: "Restaurant owner",
        approvalMethod: "In person, recorded by seller",
      });
      expect(custom.lines[0].approved).toBe(true);
      expect(
        (
          await call(
            "POST",
            `${path}/${custom.id}/model`,
            {
              revision: custom.revision,
              lineId: custom.lines[0].id,
              modelId: model,
            },
            "co-admin",
          )
        ).data.code,
      ).toBe("order_preview_required");
      // Complete the 10-piece scenario: two now, six good of eight printed, replace two, deliver ten.
      let complete = (await call("POST", path, createBody)).data;
      complete = await command(complete, "allocate", {
        lineId: complete.lines[0].id,
        tagIds: free.slice(4, 6).map((p) => p.id),
      });
      complete = await command(complete, "deliver", {
        tagIds: free.slice(4, 6).map((p) => p.id),
        paymentStatus: "paid",
        applyCreditCents: 0,
        paymentMethod: "cash",
      });
      complete = await command(complete, "produce", {
        lineId: complete.lines[0].id,
      });
      async function printFor(current: any, badCount = 0) {
        const jobs = (
          await db.execute(
            sql`SELECT j.* FROM print_jobs j JOIN print_requests r ON r.id=j.request_id WHERE r.customer_order_line_id=${current.lines[0].id} AND j.status='requested' ORDER BY j.plate_number`,
          )
        ).rows as any[];
        let left = badCount;
        for (const job of jobs) {
          const tags = (
            await db.execute(
              sql`SELECT public_code FROM tags WHERE batch_id=${job.batch_id} ORDER BY id`,
            )
          ).rows as any[];
          const bad = tags.slice(0, left).map((t) => t.public_code);
          left -= bad.length;
          await db.execute(
            sql`UPDATE print_jobs SET status='printing' WHERE id=${job.id}`,
          );
          await production.transitionJob(
            job.id,
            { action: "printed", userId: "co-admin", badPieces: bad },
            null,
          );
        }
        return (await call("GET", `${path}/${current.id}`)).data;
      }
      async function handAndDeliver(current: any) {
        const tagIds = current.lines[0].units
          .filter((p: any) => p.state === "allocated")
          .map((p: any) => p.tagId);
        current = await command(
          current,
          "dispatch",
          { lineId: current.lines[0].id, tagIds },
          "co-admin",
        );
        return command(current, "deliver", {
          tagIds,
          paymentStatus: "paid",
          applyCreditCents: 0,
          paymentMethod: "cash",
        });
      }
      complete = await printFor(complete, 2);
      expect([complete.lines[0].allocated, complete.lines[0].toProduce]).toEqual([2, 6]);
      complete = await command(complete, "produce", { lineId: complete.lines[0].id });
      complete = await printFor(complete);
      expect([
        complete.lines[0].allocated,
        complete.lines[0].toProduce,
      ]).toEqual([6, 2]);
      complete = await handAndDeliver(complete);
      expect(complete.lines[0].delivered).toBe(8);
      complete = await command(complete, "produce", {
        lineId: complete.lines[0].id,
      });
      complete = await printFor(complete);
      complete = await handAndDeliver(complete);
      expect([
        complete.workState,
        complete.lines[0].delivered,
        complete.lines[0].remaining,
        complete.deliveries.length,
      ]).toEqual(["delivered", 10, 0, 3]);
      // Uploaded PNG and a valid GLB (one triangle) use the real private-file service.
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2qkAAAAASUVORK5CYII=";
      const artKey = randomUUID(),
        artBody = {
          revision: custom.revision,
          lineId: custom.lines[0].id,
          kind: "proof",
          description: "Revised gold artwork",
          file: { filename: "proof.png", contentType: "image/png", data: png },
        };
      const proofReplies = await Promise.all([
        call(
          "POST",
          `${path}/${custom.id}/artwork`,
          artBody,
          "co-admin",
          artKey,
        ),
        call(
          "POST",
          `${path}/${custom.id}/artwork`,
          artBody,
          "co-admin",
          artKey,
        ),
      ]);
      expect(proofReplies.map((r) => r.status)).toEqual([200, 200]);
      custom = proofReplies[0].data;
      expect(custom.lines[0].approved).toBe(false);
      const art = custom.lines[0].artwork.at(-1);
      expect(art.hasFile).toBe(true);
      expect(store.objects.size).toBe(1);
      expect(
        (
          await fetch(`${base}${path}/${custom.id}/artwork/${art.id}/file`, {
            headers: { "x-test-user": "co-other" },
          })
        ).status,
      ).toBe(404);
      const artFile = await fetch(
        `${base}${path}/${custom.id}/artwork/${art.id}/file`,
        { headers: { "x-test-user": "co-seller" } },
      );
      expect(artFile.status).toBe(200);
      expect(
        Buffer.from(await artFile.arrayBuffer()).equals(
          Buffer.from(png, "base64"),
        ),
      ).toBe(true);
      custom = await command(custom, "approve", {
        artworkId: art.id,
        approvedBy: "Restaurant owner",
        approvalMethod: "Signed proof in person",
      });
      const dedicated = await production.createModel(
        {
          customerOrderLineId: custom.lines[0].id,
          slug: "co-custom",
          title: "CO Custom gold",
          kind: "serialized",
          productType: "large_plate",
          face: "menu",
          theme: "gold",
          salesProductId: product,
          batchPrefix: "COART",
          sortOrder: 0,
          version: {
            builder: "plate.menu",
            params: {},
            recipe: {},
            beds: [{ label: "x1", copies: 1 }],
            consumes: [],
          },
        },
        "co-admin",
      );
      const customModel = dedicated.id,
        customVersion = dedicated.currentVersion!.id;
      expect(
        JSON.stringify(
          (await call("GET", PRINT_PREVIEW_CATALOG_PATH, undefined, "co-other"))
            .data,
        ),
      ).not.toContain("co-custom");
      const json = Buffer.from(
        JSON.stringify({
          asset: { version: "2.0" },
          scene: 0,
          scenes: [{ nodes: [0] }],
          nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          buffers: [{ byteLength: 36 }],
          bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
          ],
          accessors: [
            {
              bufferView: 0,
              componentType: 5126,
              count: 3,
              type: "VEC3",
              min: [0, 0, 0],
              max: [1, 1, 0],
            },
          ],
        }),
      );
      const padded = Buffer.concat([
          json,
          Buffer.alloc((4 - (json.length % 4)) % 4, 32),
        ]),
        bin = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
        glb = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
      glb.write("glTF");
      glb.writeUInt32LE(2, 4);
      glb.writeUInt32LE(glb.length, 8);
      glb.writeUInt32LE(padded.length, 12);
      glb.write("JSON", 16);
      padded.copy(glb, 20);
      glb.writeUInt32LE(bin.length, 20 + padded.length);
      glb.write("BIN\0", 24 + padded.length);
      bin.copy(glb, 28 + padded.length);
      await production.attachVersionPreview(
        customModel,
        customVersion,
        "custom.glb",
        glb,
        "co-admin",
      );
      custom = await command(
        custom,
        "model",
        { lineId: custom.lines[0].id, modelId: customModel },
        "co-admin",
      );
      expect(
        (await call("GET", `${path}/catalog`)).data.models.some(
          (m: any) => m.id === customModel,
        ),
      ).toBe(false);
      const previews = await call(
        "GET",
        PRINT_PREVIEW_CATALOG_PATH,
        undefined,
        "co-other",
      );
      expect(previews.status).toBe(200);
      expect(JSON.stringify(previews.data)).not.toContain("co-custom");
      expect(
        (
          await fetch(base + printModelPreviewPath("co-custom", ""), {
            headers: { "x-test-user": "co-other" },
          })
        ).status,
      ).toBe(404);
      custom = await command(custom, "produce", { lineId: custom.lines[0].id });
      custom = await printFor(custom);
      custom = await handAndDeliver(custom);
      expect(custom.workState).toBe("delivered");
      const wrongCustomer = (
        await one(
          sql`INSERT INTO sales_leads(organization_id,name,owner_rep_id,source,status) VALUES(${org},'CO Wrong customer',${rep["co-other"]},'field','lead') RETURNING id`,
        )
      ).id;
      const customTag = custom.lines[0].units.find(
        (u: any) => u.state === "delivered",
      ).tagId;
      try {
        await db.execute(
          sql`UPDATE tags SET lead_id=${wrongCustomer} WHERE id=${customTag}`,
        );
        throw new Error("Private design was reassigned");
      } catch (error: any) {
        expect(error.cause?.message ?? error.message).toContain(
          "order_piece_design",
        );
      }
      // An approved producer sees only its fulfillment lines, never the selling price or receipts.
      await db.execute(
        sql`INSERT INTO users(id,email,is_admin) VALUES('co-producer','producer@co.test',false)`,
      );
      const producerRep = (
        await one(
          sql`INSERT INTO sales_reps(user_id,display_name,role,is_active,modules,cost_policy,cost_policy_configured_at) VALUES('co-producer','CO Partner','rep',true,ARRAY['tags'],'zero',now()) RETURNING id`,
        )
      ).id;
      const producerOrg = (
        await one(
          sql`INSERT INTO organizations(name,slug,prints_own_pieces,distribution) VALUES('CO Producer','co-producer',true,'own') RETURNING id`,
        )
      ).id;
      await db.execute(
        sql`INSERT INTO organization_memberships(organization_id,rep_id,role,is_active) VALUES(${producerOrg},${producerRep},'admin',true)`,
      );
      await db.execute(
        sql`INSERT INTO organization_links(producer_id,seller_id) VALUES(${producerOrg},${org})`,
      );
      await db.execute(
        sql`UPDATE sales_reps SET cost_policy='acquisition' WHERE id=${rep["co-seller"]}`,
      );
      let partner = (
        await call("POST", path, {
          ...createBody,
          lines: [
            {
              ...createBody.lines[0],
              quantity: 1,
              producerOrganizationId: producerOrg,
            },
          ],
        })
      ).data;
      partner = await command(partner, "produce", {
        lineId: partner.lines[0].id,
      });
      partner = await printFor(partner);
      const producerView = await call(
        "GET",
        `${path}/${partner.id}`,
        undefined,
        "co-producer",
      );
      expect(producerView.status).toBe(200);
      expect(producerView.data.sellerView).toBe(false);
      expect(producerView.data.lines[0].unitPriceCents).toBeUndefined();
      expect(producerView.data.creditCents).toBeUndefined();
      expect(producerView.data.payments).toEqual([]);
      expect(
        (await call("GET", `${path}/${complete.id}`, undefined, "co-producer"))
          .status,
      ).toBe(404);
      const partnerTags = partner.lines[0].units
        .filter((p: any) => p.state === "allocated")
        .map((p: any) => p.tagId);
      expect(
        (
          await call(
            "POST",
            `${path}/${partner.id}/dispatch`,
            {
              revision: partner.revision,
              lineId: partner.lines[0].id,
              tagIds: partnerTags,
            },
            "co-producer",
          )
        ).data.code,
      ).toBe("order_cost_required");
      partner = await command(
        partner,
        "dispatch",
        {
          lineId: partner.lines[0].id,
          tagIds: partnerTags,
          unitCostCents: 250,
        },
        "co-producer",
      );
      // Producer response remains operational; refresh as seller before delivery.
      partner = (await call("GET", `${path}/${partner.id}`)).data;
      partner = await command(partner, "deliver", {
        tagIds: partnerTags,
        paymentStatus: "paid",
        applyCreditCents: 0,
        paymentMethod: "cash",
      });
      expect(
        (
          await one(
            sql`SELECT a.fulfilled_from_organization_id AS source FROM tag_acquisitions a JOIN tag_acquisition_lines l ON l.acquisition_id=a.id JOIN tag_acquisition_units u ON u.acquisition_line_id=l.id WHERE u.tag_id=${partnerTags[0]}`,
          )
        ).source,
      ).toBe(producerOrg);
      expect(
        Number(
          (
            await one(
              sql`SELECT cost_basis_cents FROM sales_sale_tags WHERE tag_id=${partnerTags[0]} AND status='active'`,
            )
          ).cost_basis_cents,
        ),
      ).toBe(250);
      await db.execute(
        sql`UPDATE sales_reps SET cost_policy='zero' WHERE id=${rep["co-seller"]}`,
      );
      // Departure: owner recovers the request; the assignee can deliver even if CRM ownership has not changed.
      let recovered = (
        await call("POST", path, {
          ...createBody,
          lines: [{ ...createBody.lines[0], quantity: 1 }],
        })
      ).data;
      await db.execute(
        sql`UPDATE sales_reps SET is_active=false WHERE id=${rep["co-seller"]}`,
      );
      recovered = await command(
        recovered,
        "change",
        { repId: rep["co-other"], reason: "Seller left the company" },
        "co-admin",
      );
      await db.execute(
        sql`UPDATE tags SET rep_id=${rep["co-other"]} WHERE id=${free[9].id}`,
      );
      recovered = await command(
        recovered,
        "allocate",
        { lineId: recovered.lines[0].id, tagIds: [free[9].id] },
        "co-other",
      );
      recovered = await command(
        recovered,
        "deliver",
        { tagIds: [free[9].id], paymentStatus: "unpaid", applyCreditCents: 0 },
        "co-other",
      );
      expect(recovered.workState).toBe("delivered");
      await db.execute(
        sql`UPDATE sales_reps SET is_active=true WHERE id=${rep["co-seller"]}`,
      );
      // Won Deals convert once rather than create a second request.
      const deal = (
        await one(
          sql`INSERT INTO sales_opportunities_local(lead_id,rep_id,title,status) VALUES(${lead},${rep["co-seller"]},'CO deal','won') RETURNING id`,
        )
      ).id;
      const converted = await Promise.all([
        call("POST", path, { ...createBody, opportunityId: deal }),
        call("POST", path, { ...createBody, opportunityId: deal }),
      ]);
      expect(converted[0].data.id).toBe(converted[1].data.id);
      // No member cost leak in the old pieces API; allocation is visible as an order reference.
      const tags = await call(
        "GET",
        "/api/xpot/tags?stockStatus=available&limit=100",
      );
      expect(tags.status).toBe(200);
      expect(JSON.stringify(tags.data)).not.toContain("acquisitionCostCents");
      const list = await call("GET", `${path}?limit=1&offset=0`);
      expect(list.data.total).toBeGreaterThan(1);
      expect(list.data.items.length).toBe(1);
      expect(list.data.nextOffset).toBe(1);
      // The real MCP SDK sees the explicit family only, and the same account boundary as the app.
      async function mcpFor(user: string, scope = "xpot:orders") {
        const client = new Client({ name: "orders-test", version: "1.0.0" });
        await client.connect(
          new StreamableHTTPClientTransport(new URL(base + "/co-mcp"), {
            requestInit: {
              headers: { "x-test-user": user, "x-test-scope": scope },
            },
          }),
        );
        return client;
      }
      const mcp = await mcpFor("co-seller");
      try {
        expect(
          (await mcp.listTools()).tools.some(
            (t) => t.name === "customer_order_get",
          ),
        ).toBe(true);
        const result = await mcp.callTool({
          name: "customer_order_get",
          arguments: { id: complete.id },
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.parse((result.content as any[])[0].text).id).toBe(
          complete.id,
        );
      } finally {
        await mcp.close();
      }
      const otherMcp = await mcpFor("co-other");
      try {
        const result = await otherMcp.callTool({
          name: "customer_order_get",
          arguments: { id: complete.id },
        });
        expect(result.isError).toBe(true);
        expect((result.content as any[])[0].text).toBe("order_not_found");
      } finally {
        await otherMcp.close();
      }
      const tasksOnly = await mcpFor("co-seller", "xpot:tasks");
      try {
        expect(
          (await tasksOnly.listTools()).tools.some((t) =>
            t.name.startsWith("customer_order"),
          ),
        ).toBe(false);
      } finally {
        await tasksOnly.close();
      }
      const { storage } = await import("../server/storage.js");
      expect(
        (await storage.leadDeletionCounts([lead])).get(lead)!.orders,
      ).toBeGreaterThan(0);
      await expect(storage.deleteSalesLead(lead)).rejects.toThrow();
      // Deleting the login keeps its order, converted Deal and business as recoverable history.
      await db.execute(
        sql`INSERT INTO users(id,email,is_admin) VALUES('co-delete','delete@co.test',false)`,
      );
      const departed = (
        await one(
          sql`INSERT INTO sales_reps(user_id,display_name,role,is_active,modules,cost_policy,cost_policy_configured_at) VALUES('co-delete','CO Departed','rep',true,ARRAY['tags'],'zero',now()) RETURNING id`,
        )
      ).id;
      await db.execute(
        sql`INSERT INTO organization_memberships(organization_id,rep_id,role,is_active) VALUES(${org},${departed},'member',true)`,
      );
      const departedLead = (
        await one(
          sql`INSERT INTO sales_leads(organization_id,name,owner_rep_id,source,status) VALUES(${org},'CO Departed business',${departed},'field','lead') RETURNING id`,
        )
      ).id;
      const departedDeal = (
        await one(
          sql`INSERT INTO sales_opportunities_local(lead_id,rep_id,title,status) VALUES(${departedLead},${departed},'Keep converted Deal','won') RETURNING id`,
        )
      ).id;
      const departedOrder = await call(
        "POST",
        path,
        { ...createBody, leadId: departedLead, opportunityId: departedDeal },
        "co-delete",
      );
      expect(departedOrder.status).toBe(201);
      const { deleteRepAccountRows } = await import(
        "../server/accountDeletion.js"
      );
      await deleteRepAccountRows(departed);
      expect(
        (
          await one(
            sql`SELECT id FROM customer_orders WHERE id=${departedOrder.data.id}`,
          )
        ).id,
      ).toBe(departedOrder.data.id);
      expect(
        (
          await one(
            sql`SELECT id FROM sales_opportunities_local WHERE id=${departedDeal}`,
          )
        ).id,
      ).toBe(departedDeal);
      expect(
        (
          await one(
            sql`SELECT display_name FROM sales_reps WHERE id=${departed}`,
          )
        ).display_name,
      ).toBe("Deleted account");
      await expect(
        db.execute(
          sql`DELETE FROM customer_order_payments WHERE order_id=${order.id}`,
        ),
      ).rejects.toThrow();
      let ready = (
        await call("POST", path, {
          ...createBody,
          lines: [
            {
              ...createBody.lines[0],
              description: "Restaurant · ten menu plates",
              unitPriceCents: 2000,
            },
          ],
        })
      ).data;
      ready = await command(ready, "allocate", {
        lineId: ready.lines[0].id,
        tagIds: [free[6].id, free[7].id],
      });
      ready = await command(ready, "payments", {
        kind: "received",
        amountCents: 6000,
        paymentMethod: "cash",
        reason: "Customer advance payment",
      });
      ready = await command(ready, "produce", { lineId: ready.lines[0].id });
      const waiting = (
        await call("POST", path, {
          ...createBody,
          lines: [
            {
              ...createBody.lines[0],
              description: "Custom restaurant sign",
              quantity: 1,
              custom: true,
              modelId: undefined,
            },
          ],
        })
      ).data;
      if (process.env.ORDER_EVIDENCE_DIR) {
        const { writeFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        writeFileSync(
          join(process.env.ORDER_EVIDENCE_DIR, "impl-fixtures.json"),
          JSON.stringify({
            orders: {
              complete: complete.id,
              custom: custom.id,
              cancelled: order.id,
              partner: partner.id,
              recovered: recovered.id,
              ready: ready.id,
              waiting: waiting.id,
            },
            files: Object.fromEntries(
              Array.from(store.objects.entries()).map(([key, value]) => [
                key,
                Buffer.from(value).toString("base64"),
              ]),
            ),
          }),
        );
      }
    } finally {
      setFileStoresForTests(null);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    }
  },
  120_000,
);
