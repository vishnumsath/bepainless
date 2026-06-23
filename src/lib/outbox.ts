// IndexedDB outbox: queues writes when offline, drains when online.
// Operations: upsert (single), bulkUpsert, deleteOne, deleteRange.
import { openDB, type IDBPDatabase } from "idb";
import { upsertEntry, deleteEntry, bulkMarkNoHeadache, deleteEntriesInRange, importEntries } from "./entries.functions";

export type OutboxOp =
  | { kind: "upsert"; date: string; has_headache: boolean; severity: "mild" | "moderate" | "severe" | null; acute_med?: boolean | null }
  | { kind: "deleteOne"; date: string }
  | { kind: "bulkNo"; dates: string[] }
  | { kind: "deleteRange"; start: string | null; end: string | null }
  | { kind: "import"; entries: Array<{ date: string; has_headache: boolean; severity: "mild" | "moderate" | "severe" | null; acute_med?: boolean | null }> };

const CHANGE_EVENT = "painless-outbox-change";
function emitChange() {
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* ignore */ }
  }
}
export function onOutboxChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}


interface QueuedItem { id?: number; op: OutboxOp; ts: number; tries: number }

const DB_NAME = "painless-outbox";
const STORE = "ops";
let dbP: Promise<IDBPDatabase> | null = null;

function db() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no idb"));
  if (!dbP) {
    dbP = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }
  return dbP;
}

async function enqueue(op: OutboxOp) {
  try {
    const d = await db();
    await d.add(STORE, { op, ts: Date.now(), tries: 0 } as QueuedItem);
  } catch { /* ignore */ }
  // Try to register a Background Sync so SW can later kick a drain.
  try {
    const reg = await navigator.serviceWorker?.ready;
    // @ts-expect-error -- not in lib.dom yet in all TS targets
    await reg?.sync?.register("painless-outbox");
  } catch { /* ignore */ }
}

async function executeOp(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case "upsert":
      await upsertEntry({ data: { date: op.date, has_headache: op.has_headache, severity: op.severity, acute_med: op.acute_med ?? null } });
      return;
    case "deleteOne":
      await deleteEntry({ data: { date: op.date } });
      return;
    case "bulkNo":
      await bulkMarkNoHeadache({ data: { dates: op.dates } });
      return;
    case "deleteRange":
      await deleteEntriesInRange({ data: { start: op.start, end: op.end } });
      return;
    case "import":
      await importEntries({ data: { entries: op.entries } });
      return;
  }
}

// Best-effort online check
function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// Execute immediately if online; queue if it fails (offline / network blip).
export async function send(op: OutboxOp): Promise<void> {
  if (online()) {
    try {
      await executeOp(op);
      emitChange();
      return;
    } catch (_) {
      // fall through to queue
    }
  }
  await enqueue(op);
  emitChange();
}


let draining = false;
export async function drainOutbox(): Promise<{ drained: number; remaining: number }> {
  if (draining) return { drained: 0, remaining: 0 };
  draining = true;
  let drained = 0;
  try {
    const d = await db();
    let items = (await d.getAll(STORE)) as QueuedItem[];
    items = items.sort((a, b) => (a.id! - b.id!));
    for (const it of items) {
      try {
        await executeOp(it.op);
        await d.delete(STORE, it.id!);
        drained++;
      } catch (_) {
        // Stop on first failure to preserve order. Bump tries.
        it.tries++;
        await d.put(STORE, it);
        if (it.tries < 8) break;
        // Drop after 8 failures to avoid wedging
        await d.delete(STORE, it.id!);
      }
    }
    const remaining = (await d.count(STORE));
    if (drained > 0) emitChange();
    return { drained, remaining };
  } catch {
    return { drained: 0, remaining: 0 };
  } finally {
    draining = false;
  }
}


export async function pendingCount(): Promise<number> {
  try { return await (await db()).count(STORE); } catch { return 0; }
}

let installed = false;
export function installOutboxDrainer(onChange?: () => void) {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  const tick = async () => {
    if (!online()) return;
    const r = await drainOutbox();
    if (r.drained && onChange) onChange();
  };
  window.addEventListener("online", tick);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  navigator.serviceWorker?.addEventListener?.("message", (e) => {
    if (e.data?.type === "drain-outbox") tick();
  });
  // Kick once on boot
  setTimeout(tick, 800);
}
