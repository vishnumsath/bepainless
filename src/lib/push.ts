// Client-side Web Push subscription helpers.
import { swReady } from "./sw-register";
import { savePushSubscription, deletePushSubscription } from "./push-subs.functions";

// Baked in — publishable VAPID key.
export const VAPID_PUBLIC_KEY =
  "BKfQuH85Zbe3DNNZLWK1d-YKlCAqln30rzns05_R1soW_x18nwd37DI6k9eTB47jJInxn4vMBxFLZ2zmhWXvwsY";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") {
    const res = await Notification.requestPermission();
    if (res !== "granted") return false;
  }
  const reg = await swReady();
  if (!reg) return false;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }
  const p256dh = bufToB64Url(sub.getKey("p256dh"));
  const auth = bufToB64Url(sub.getKey("auth"));
  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
  });
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await swReady();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await deletePushSubscription({ data: { endpoint: sub.endpoint } });
  } catch { /* ignore */ }
  await sub.unsubscribe();
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await swReady();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
