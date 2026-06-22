import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getEntriesInRange } from "@/lib/entries.functions";
import { send } from "@/lib/outbox";
import { addDays, endOfMonth, parseISODate, startOfMonth, toISODate, formatPretty } from "@/lib/painless-date";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — PainLess" }] }),
  component: HistoryPage,
});

type Entry = { entry_date: string; has_headache: boolean; severity: "mild" | "moderate" | "severe" | null };

function HistoryPage() {
  const qc = useQueryClient();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const start = toISODate(startOfMonth(cursor));
  const end = toISODate(endOfMonth(cursor));

  const { data: entries = [] } = useQuery({
    queryKey: ["entries", start, end],
    queryFn: () => getEntriesInRange({ data: { start, end } }) as Promise<Entry[]>,
  });

  const map = useMemo(() => new Map(entries.map((e) => [e.entry_date, e])), [entries]);
  const todayIso = toISODate(new Date());

  const [openDate, setOpenDate] = useState<string | null>(null);
  const openEntry = openDate ? map.get(openDate) ?? null : null;

  const saveMut = useMutation({
    mutationFn: async (vars: { date: string; has_headache: boolean; severity: Entry["severity"] }) => {
      await send({ kind: "upsert", date: vars.date, has_headache: vars.has_headache, severity: vars.severity });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entries"] }); setOpenDate(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const delMut = useMutation({
    mutationFn: async (vars: { date: string }) => { await send({ kind: "deleteOne", date: vars.date }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entries"] }); setOpenDate(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  // Build month grid (leading blanks + days)
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const leading = monthStart.getDay(); // 0 = Sun
  const days: (string | null)[] = [];
  for (let i = 0; i < leading; i++) days.push(null);
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) days.push(toISODate(d));
  while (days.length % 7 !== 0) days.push(null);

  return (
    <AppShell title="History">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setCursor(addDays(monthStart, -1))} className="rounded-lg p-2 hover:bg-accent" aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <button onClick={() => setCursor(addDays(monthEnd, 1))} className="rounded-lg p-2 hover:bg-accent" aria-label="Next month">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((iso, i) => {
          if (!iso) return <div key={i} className="aspect-square" />;
          const e = map.get(iso);
          const isToday = iso === todayIso;
          const isFuture = iso > todayIso;
          const dot = !e
            ? "bg-muted"
            : !e.has_headache
              ? "bg-painfree"
              : e.severity === "mild"
                ? "bg-mild"
                : e.severity === "moderate"
                  ? "bg-moderate"
                  : "bg-severe";
          return (
            <button
              key={iso}
              onClick={() => !isFuture && setOpenDate(iso)}
              disabled={isFuture}
              aria-disabled={isFuture}
              className={cn(
                "group flex aspect-square flex-col items-center justify-center rounded-xl transition-colors",
                isToday ? "ring-1 ring-foreground/40" : !isFuture && "hover:bg-accent",
                isFuture && "cursor-not-allowed opacity-30",
              )}
            >
              <span className="text-sm">{parseISODate(iso).getDate()}</span>
              <span className={cn("mt-1 h-1.5 w-1.5 rounded-full", isFuture ? "bg-transparent" : dot)} />
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Legend cls="bg-painfree" label="Pain-free" />
        <Legend cls="bg-mild" label="Mild" />
        <Legend cls="bg-moderate" label="Moderate" />
        <Legend cls="bg-severe" label="Severe" />
      </div>

      <Sheet open={!!openDate} onOpenChange={(v) => !v && setOpenDate(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{openDate ? formatPretty(openDate) : ""}</SheetTitle>
          </SheetHeader>
          {openDate ? (
            <DayEditor
              entry={openEntry}
              busy={saveMut.isPending || delMut.isPending}
              onSave={(has, sev) => saveMut.mutate({ date: openDate, has_headache: has, severity: sev })}
              onDelete={() => delMut.mutate({ date: openDate })}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", cls)} />
      <span>{label}</span>
    </div>
  );
}

function DayEditor({
  entry, onSave, onDelete, busy,
}: {
  entry: Entry | null;
  onSave: (has: boolean, sev: "mild" | "moderate" | "severe" | null) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="pb-6 pt-2">
      <p className="mb-3 text-sm text-muted-foreground">Set this day's log:</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={entry && !entry.has_headache ? "default" : "outline"} className="h-14 rounded-xl" disabled={busy} onClick={() => onSave(false, null)}>
          No headache
        </Button>
        <Button variant="outline" className="h-14 rounded-xl" disabled={busy} onClick={() => onSave(true, entry?.severity ?? "mild")}>
          Had headache
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["mild", "moderate", "severe"] as const).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => onSave(true, s)}
            className={cn(
              "h-14 rounded-xl text-sm font-semibold capitalize transition-transform active:scale-[0.98]",
              s === "mild" && "bg-mild text-mild-foreground",
              s === "moderate" && "bg-moderate text-moderate-foreground",
              s === "severe" && "bg-severe text-severe-foreground",
              entry?.has_headache && entry.severity === s && "ring-2 ring-foreground/60",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {entry ? (
        <Button variant="ghost" className="mt-4 w-full text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete entry
        </Button>
      ) : null}
    </div>
  );
}
