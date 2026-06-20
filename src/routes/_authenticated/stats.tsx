import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertCircle, Download } from "lucide-react";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { bulkMarkNoHeadache, getEntriesInRange } from "@/lib/entries.functions";
import { getProfile } from "@/lib/profile.functions";
import { downloadSummaryJPG } from "@/lib/export-jpg";
import { addDays, eachDayISO, parseISODate, toISODate } from "@/lib/painless-date";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Stats — PainLess" }] }),
  component: StatsPage,
});

type Entry = { entry_date: string; has_headache: boolean; severity: "mild" | "moderate" | "severe" | null };
type RangeKey = "7" | "30" | "custom";

function StatsPage() {
  const qc = useQueryClient();
  const bulk = useServerFn(bulkMarkNoHeadache);

  const [rangeKey, setRangeKey] = useState<RangeKey>("7");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});

  const { start, end } = useMemo(() => {
    const today = new Date();
    if (rangeKey === "7") return { start: toISODate(addDays(today, -6)), end: toISODate(today) };
    if (rangeKey === "30") return { start: toISODate(addDays(today, -29)), end: toISODate(today) };
    if (custom.from && custom.to) return { start: toISODate(custom.from), end: toISODate(custom.to) };
    return { start: toISODate(addDays(today, -6)), end: toISODate(today) };
  }, [rangeKey, custom]);

  const { data: entries = [] } = useQuery({
    queryKey: ["entries", start, end],
    queryFn: () => getEntriesInRange({ data: { start, end } }) as Promise<Entry[]>,
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });

  const stats = useMemo(() => {
    const all = eachDayISO(parseISODate(start), parseISODate(end));
    const m = new Map(entries.map((e) => [e.entry_date, e]));
    let headache = 0, painfree = 0, mild = 0, moderate = 0, severe = 0;
    const missing: string[] = [];
    for (const d of all) {
      const e = m.get(d);
      if (!e) { missing.push(d); continue; }
      if (!e.has_headache) painfree++;
      else {
        headache++;
        if (e.severity === "mild") mild++;
        else if (e.severity === "moderate") moderate++;
        else if (e.severity === "severe") severe++;
      }
    }
    return { total: all.length, headache, painfree, mild, moderate, severe, missing };
  }, [entries, start, end]);

  const bulkMut = useMutation({
    mutationFn: (dates: string[]) => bulk({ data: { dates } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entries"] }); toast.success("Filled in missing days."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk insert failed"),
  });

  async function handleExport() {
    try {
      await downloadSummaryJPG({
        start, end, entries,
        patient: { name: profile?.name, age: profile?.age, gender: profile?.gender },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <AppShell title="Stats">
      <div className="flex flex-wrap items-center gap-2">
        {(["7", "30", "custom"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setRangeKey(k)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              rangeKey === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {k === "7" ? "7 Days" : k === "30" ? "30 Days" : "Custom"}
          </button>
        ))}
        {rangeKey === "custom" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto h-9">
                {custom.from && custom.to
                  ? `${toISODate(custom.from)} → ${toISODate(custom.to)}`
                  : "Pick dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: custom.from, to: custom.to }}
                onSelect={(r) => setCustom({ from: r?.from, to: r?.to })}
                numberOfMonths={1}
                className="pointer-events-auto p-3"
              />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {fmtRange(start, end)} · {stats.total} day{stats.total === 1 ? "" : "s"}
      </p>

      {stats.missing.length > 0 ? (
        <Card className="mt-4 border-foreground/15 bg-accent/40 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-foreground/80" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                You have {stats.missing.length} unlogged day{stats.missing.length === 1 ? "" : "s"} in this period.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-9"
                disabled={bulkMut.isPending}
                onClick={() => bulkMut.mutate(stats.missing)}
              >
                Mark all as 'No Headache'
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <BigMetric label="Headache" value={stats.headache} tone="severe" />
        <BigMetric label="Pain-Free" value={stats.painfree} tone="painfree" />
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Severity Breakdown
      </h3>
      <div className="mt-3 space-y-3">
        <SeverityBar label="Mild" count={stats.mild} total={stats.headache} color="bg-mild" />
        <SeverityBar label="Moderate" count={stats.moderate} total={stats.headache} color="bg-moderate" />
        <SeverityBar label="Severe" count={stats.severe} total={stats.headache} color="bg-severe" />
      </div>

      <Button onClick={handleExport} className="mt-8 h-12 w-full text-base">
        <Download className="mr-2 h-5 w-5" /> Export Summary as JPG
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Printer-friendly white background for sharing with your doctor.
      </p>
    </AppShell>
  );
}

function BigMetric({ label, value, tone }: { label: string; value: number; tone: "severe" | "painfree" }) {
  return (
    <Card className={cn("flex flex-col items-center justify-center rounded-2xl p-5", tone === "severe" ? "bg-severe/15" : "bg-painfree/15")}>
      <div className={cn("text-5xl font-bold tabular-nums", tone === "severe" ? "text-severe" : "text-painfree")}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    </Card>
  );
}

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{pct}% · {count} day{count === 1 ? "" : "s"}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtRange(s: string, e: string) {
  const f = (iso: string) => parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(s)} → ${f(e)}`;
}
