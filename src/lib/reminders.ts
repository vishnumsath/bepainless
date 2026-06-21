// Daily reminder scheduling using ServiceWorker showNotification (supports action buttons).
import { swReady } from "./sw-register";

let timer: ReturnType<typeof setTimeout> | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function notificationsEnabled(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

export function clearReminder() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function msUntilNext(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function fire() {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;
  const reg = await swReady();
  if (reg) {
    reg.active?.postMessage({ type: "show-reminder" });
  } else {
    // Fallback (no SW): basic notification, no action buttons
    try { new Notification("PainLess check-in", { body: "Did you have a headache today?", icon: "/icon-192.png", tag: "painless-daily" }); } catch { /* ignore */ }
  }
}

export function scheduleReminder(hhmm: string) {
  if (typeof window === "undefined") return;
  clearReminder();
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
  const tick = async () => {
    await fire();
    timer = setTimeout(tick, 24 * 60 * 60 * 1000);
  };
  timer = setTimeout(tick, msUntilNext(hhmm));
}
