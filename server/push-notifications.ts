import webPush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { salesPushSubscriptions } from "#shared/schema.js";
import type { z } from "zod";
import type { xpotPushSubscriptionSchema } from "#shared/xpot.js";

type PushSubscriptionInput = z.infer<typeof xpotPushSubscriptionSchema>;

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export async function savePushSubscription(repId: number, input: PushSubscriptionInput, userAgent?: string) {
  const [subscription] = await db.insert(salesPushSubscriptions).values({
    repId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 500),
  }).onConflictDoUpdate({
    target: salesPushSubscriptions.endpoint,
    set: {
      repId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 500),
      updatedAt: new Date(),
    },
  }).returning();
  return subscription;
}

export async function sendPushNotification(repId: number, payload: { title: string; body: string; href: string }) {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return { sent: 0, configured: false };
  webPush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:support@xpot.place", publicKey, privateKey);
  const subscriptions = await db.select().from(salesPushSubscriptions).where(eq(salesPushSubscriptions.repId, repId));
  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(salesPushSubscriptions).where(eq(salesPushSubscriptions.id, subscription.id));
      } else {
        console.error("[push notification] delivery failed:", error);
      }
    }
  }));
  return { sent, configured: true };
}
