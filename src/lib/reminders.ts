// Daily reminder scheduling using ServiceWorker showNotification (with actions).
// Persists across page navigations and reschedules on every app launch.
import { swReady } from "./sw-register";

const STORAGE_KEY = "painless-reminder";
let timer: ReturnType<typeof setTimeout> | null = null;

type Stored = { time: string; enabled: boolean };

function readStored(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Stored;
  } catch { return null; }
}

function writeStored(v: Stored | null) {
  if (typeof window === "undefined") return;
  try {
    if (!v) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch { /* ignore */ }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function notificationsEnabled(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  const s = readStored();
  return Notification.permission === "granted" && !!s?.enabled;
}

export function getReminderTime(): string {
  return readStored()?.time ?? "";
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
    try {
      await reg.showNotification("PainLess check-in", {
        body: "Did you have a headache today?",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "painless-daily",
        requireInteraction: false,
        // @ts-expect-error actions is valid on Notification API
        actions: [
          { action: "nopain", title: "No Headache" },
          { action: "headache", title: "Log Headache" },
        ],
        data: { url: "/today" },
      });
      return;
    } catch { /* fall through */ }
  }
  try {
    new Notification("PainLess check-in", {
      body: "Did you have a headache today?",
      icon: "/icon-192.png",
      tag: "painless-daily",
    });
  } catch { /* ignore */ }
}

export function scheduleReminder(hhmm: string, opts: { persist?: boolean } = { persist: true }) {
  if (typeof window === "undefined") return;
  clearReminder();
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
  if (opts.persist !== false) writeStored({ time: hhmm, enabled: true });
  const tick = async () => {
    await fire();
    timer = setTimeout(tick, 24 * 60 * 60 * 1000);
  };
  timer = setTimeout(tick, msUntilNext(hhmm));
}

export function disableReminder() {
  clearReminder();
  const s = readStored();
  if (s) writeStored({ ...s, enabled: false });
}

/** Call once on app boot — reschedules if user previously enabled. */
export function initReminderFromStorage() {
  if (typeof window === "undefined") return;
  const s = readStored();
  if (!s?.enabled || !s.time) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  scheduleReminder(s.time, { persist: false });
}

/** Fire a sample notification — used by the Settings "Test" button. */
export async function testReminder() {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;
  await fire();
  return true;
}
