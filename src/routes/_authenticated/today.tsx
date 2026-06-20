import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { getEntriesInRange, upsertEntry } from "@/lib/entries.functions";
import { todayISO } from "@/lib/painless-date";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [{ title: "Today — PainLess" }],
  }),
  component: TodayPage,
});

const todayQuery = (date: string) =>
  queryOptions({
    queryKey: ["entries", date, date],
    queryFn: () => getEntriesInRange({ data: { start: date, end: date } }),
  });

function TodayPage() {
  const navigate = useNavigate();
  const date = todayISO();
  const qc = useQueryClient();
  const upsert = useServerFn(upsertEntry);

  const { data, isLoading } = useQuery(todayQuery(date));
  const todayEntry = data?.[0];

  const [step, setStep] = useState<"ask" | "severity">("ask");
  const [justSaved, setJustSaved] = useState<null | "no" | "mild" | "moderate" | "severe">(null);

  const saving = useMutation({
    mutationFn: (vars: { has_headache: boolean; severity: "mild" | "moderate" | "severe" | null }) =>
      upsert({ data: { date, ...vars } }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entries"] });
      setJustSaved(vars.has_headache ? (vars.severity as "mild") : "no");
      setStep("ask");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const logged = !!todayEntry || justSaved !== null;

  return (
    <AppShell>
      <section className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>

        {isLoading ? (
          <div className="mt-10 h-32 w-32 animate-pulse rounded-full bg-muted" />
        ) : logged && step === "ask" ? (
          <LoggedState
            entry={todayEntry ?? { has_headache: justSaved !== "no", severity: justSaved === "no" ? null : (justSaved as "mild" | "moderate" | "severe") }}
            onChange={() => { setJustSaved(null); setStep("ask"); qc.invalidateQueries({ queryKey: ["entries"] }); navigate({ to: "/history" }); }}
            onYesAgain={() => setStep("severity")}
          />
        ) : step === "severity" ? (
          <SeverityPicker
            disabled={saving.isPending}
            onPick={(sev) => saving.mutate({ has_headache: true, severity: sev })}
            onBack={() => setStep("ask")}
          />
        ) : (
          <AskPrompt
            disabled={saving.isPending}
            onNo={() => saving.mutate({ has_headache: false, severity: null })}
            onYes={() => setStep("severity")}
          />
        )}
      </section>
    </AppShell>
  );
}

function AskPrompt({ onYes, onNo, disabled }: { onYes: () => void; onNo: () => void; disabled: boolean }) {
  return (
    <div className="animate-slide-up w-full">
      <h2 className="text-3xl font-semibold leading-snug tracking-tight">
        Did you have a<br />headache today?
      </h2>
      <div className="mt-12 grid grid-cols-2 gap-4">
        <Button
          size="lg"
          variant="outline"
          disabled={disabled}
          onClick={onNo}
          className="h-28 rounded-2xl border-2 text-xl font-semibold"
        >
          No
        </Button>
        <Button
          size="lg"
          disabled={disabled}
          onClick={onYes}
          className="h-28 rounded-2xl text-xl font-semibold"
        >
          Yes
        </Button>
      </div>
    </div>
  );
}

const SEVERITY = [
  { key: "mild", label: "Mild", bg: "bg-mild text-mild-foreground" },
  { key: "moderate", label: "Moderate", bg: "bg-moderate text-moderate-foreground" },
  { key: "severe", label: "Severe", bg: "bg-severe text-severe-foreground" },
] as const;

function SeverityPicker({ onPick, onBack, disabled }: { onPick: (s: "mild" | "moderate" | "severe") => void; onBack: () => void; disabled: boolean }) {
  return (
    <div className="animate-slide-up w-full">
      <h2 className="text-2xl font-semibold tracking-tight">How severe was it?</h2>
      <div className="mt-8 flex flex-col gap-3">
        {SEVERITY.map((s) => (
          <button
            key={s.key}
            disabled={disabled}
            onClick={() => onPick(s.key)}
            className={cn(
              "h-20 rounded-2xl text-xl font-semibold transition-transform active:scale-[0.98]",
              s.bg,
              disabled && "opacity-60",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-6 text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </button>
    </div>
  );
}

function LoggedState({ entry, onYesAgain, onChange }: { entry: { has_headache: boolean; severity: "mild" | "moderate" | "severe" | null }; onYesAgain: () => void; onChange: () => void }) {
  const label = entry.has_headache ? `Logged — ${entry.severity ?? "headache"}` : "Logged — pain-free";
  const tone = !entry.has_headache
    ? "bg-painfree text-painfree-foreground"
    : entry.severity === "mild"
      ? "bg-mild text-mild-foreground"
      : entry.severity === "moderate"
        ? "bg-moderate text-moderate-foreground"
        : "bg-severe text-severe-foreground";
  return (
    <div className="animate-slide-up flex w-full flex-col items-center">
      <div className={cn("animate-pop-check flex h-32 w-32 items-center justify-center rounded-full", tone)}>
        <Check className="h-16 w-16" strokeWidth={3} />
      </div>
      <p className="mt-6 text-xl font-semibold capitalize">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">See you tomorrow.</p>
      <div className="mt-10 flex w-full flex-col gap-2">
        <Button variant="outline" className="h-12" onClick={onYesAgain}>
          Change today's entry
        </Button>
        <Button variant="ghost" className="h-12" onClick={onChange}>
          View history
        </Button>
      </div>
    </div>
  );
}
