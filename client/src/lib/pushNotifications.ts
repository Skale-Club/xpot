import { apiRequest } from "./queryClient";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function subscribeToRoutePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const keyResponse = await fetch("/api/xpot/notifications/push/public-key", { credentials: "include" });
  if (!keyResponse.ok) return false;
  const { publicKey } = await keyResponse.json() as { publicKey: string | null };
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  await apiRequest("POST", "/api/xpot/notifications/push/subscribe", subscription.toJSON());
  return true;
}
