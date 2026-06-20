// In-app reminder scheduler. Web limitation: notifications fire only while the
// app is open (or PWA installed and recently active). No lock-screen quick actions.

let timer: ReturnType<typeof setTimeout> | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
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

export function scheduleReminder(hhmm: string) {
  if (typeof window === "undefined") return;
  clearReminder();
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
  const tick = async () => {
    try {
      if (Notification.permission === "granted") {
        const n = new Notification("PainLess check-in", {
          body: "Did you have a headache today?",
          icon: "/icon-192.png",
          tag: "painless-daily",
        });
        n.onclick = () => { window.focus(); window.location.assign("/today"); n.close(); };
      }
    } catch { /* ignore */ }
    timer = setTimeout(tick, 24 * 60 * 60 * 1000); // schedule next day
  };
  timer = setTimeout(tick, msUntilNext(hhmm));
}
