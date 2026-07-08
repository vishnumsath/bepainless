import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { getEntriesInRange } from "@/lib/entries.functions";
import { send } from "@/lib/outbox";
import { todayISO } from "@/lib/painless-date";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const searchSchema = z.object({
  action: z.enum(["headache", "nopain", "ask"]).optional(),
});

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: "Today — PainLess" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: TodayPage,
});

type Severity = "mild" | "moderate" | "severe";

const todayQuery = (date: string) =>
  queryOptions({
    queryKey: ["entries", date, date],
    queryFn: () => getEntriesInRange({ data: { start: date, end: date } }),
  });

function TodayPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/today" });
  const date = todayISO();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery(todayQuery(date));
  const todayEntry = data?.[0] as
    | { has_headache: boolean; severity: Severity | null; acute_med: boolean | null }
    | undefined;

  const [step, setStep] = useState<"ask" | "severity" | "acuteMed">("ask");
  const [pickedSeverity, setPickedSeverity] = useState<Severity | null>(null);
  const [justSaved, setJustSaved] = useState<null | { has_headache: boolean; severity: Severity | null; acute_med: boolean | null }>(null);
  const [fromNotification, setFromNotification] = useState(false);

  const saving = useMutation({
    mutationFn: async (vars: { has_headache: boolean; severity: Severity | null; acute_med: boolean | null }) => {
      await send({ kind: "upsert", date, has_headache: vars.has_headache, severity: vars.severity, acute_med: vars.acute_med });
      return vars;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entries"] });
      setJustSaved(vars);
      setStep("ask");
      setPickedSeverity(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  // Handle deep-link from notification actions
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (search.action === "ask" || search.action === "headache" || search.action === "nopain") {
      handled.current = true;
      setFromNotification(true);
      setStep("ask");
      setPickedSeverity(null);
      setJustSaved(null);
      navigate({ to: "/today", search: {}, replace: true });
    }
  }, [search.action, navigate, saving]);

  const logged = !!todayEntry || justSaved !== null;

  return (
    <AppShell>
      <section className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>

        {isLoading ? (
          <div className="mt-10 h-32 w-32 animate-pulse rounded-full bg-muted" />
        ) : !fromNotification && logged && step === "ask" ? (
          <LoggedState
            entry={todayEntry ?? justSaved!}
            onEdit={() => navigate({ to: "/history", search: { date } })}
          />
        ) : step === "severity" ? (
          <SeverityPicker
            disabled={saving.isPending}
            onPick={(sev) => { setPickedSeverity(sev); setStep("acuteMed"); }}
            onBack={() => setStep("ask")}
          />
        ) : step === "acuteMed" ? (
          <AcuteMedPicker
            disabled={saving.isPending}
            onPick={(med) => saving.mutate({ has_headache: true, severity: pickedSeverity, acute_med: med })}
            onBack={() => setStep("severity")}
          />
        ) : (
          <AskPrompt
            disabled={saving.isPending}
            onNo={() => { setFromNotification(false); saving.mutate({ has_headache: false, severity: null, acute_med: null }); }}
            onYes={() => { setFromNotification(false); setStep("severity"); }}
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
        <Button size="lg" variant="outline" disabled={disabled} onClick={onNo} className="h-28 rounded-2xl border-2 text-xl font-semibold">No</Button>
        <Button size="lg" disabled={disabled} onClick={onYes} className="h-28 rounded-2xl text-xl font-semibold">Yes</Button>
      </div>
    </div>
  );
}

const SEVERITY = [
  { key: "mild", label: "Mild", bg: "bg-mild text-mild-foreground" },
  { key: "moderate", label: "Moderate", bg: "bg-moderate text-moderate-foreground" },
  { key: "severe", label: "Severe", bg: "bg-severe text-severe-foreground" },
] as const;

function SeverityPicker({ onPick, onBack, disabled }: { onPick: (s: Severity) => void; onBack: () => void; disabled: boolean }) {
  return (
    <div className="animate-slide-up w-full">
      <h2 className="text-2xl font-semibold tracking-tight">How severe was it?</h2>
      <div className="mt-8 flex flex-col gap-3">
        {SEVERITY.map((s) => (
          <button key={s.key} disabled={disabled} onClick={() => onPick(s.key)}
            className={cn("h-20 rounded-2xl text-xl font-semibold transition-transform active:scale-[0.98]", s.bg, disabled && "opacity-60")}>
            {s.label}
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-6 text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );
}

function AcuteMedPicker({ onPick, onBack, disabled }: { onPick: (med: boolean) => void; onBack: () => void; disabled: boolean }) {
  return (
    <div className="animate-slide-up w-full">
      <h2 className="text-2xl font-semibold leading-snug tracking-tight">Was acute medication needed?</h2>
      <div className="mt-10 grid grid-cols-2 gap-4">
        <Button size="lg" variant="outline" disabled={disabled} onClick={() => onPick(false)} className="h-24 rounded-2xl border-2 text-xl font-semibold">No</Button>
        <Button size="lg" disabled={disabled} onClick={() => onPick(true)} className="h-24 rounded-2xl text-xl font-semibold">Yes</Button>
      </div>
      <button onClick={onBack} className="mt-6 text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );
}

function LoggedState({ entry, onEdit }: { entry: { has_headache: boolean; severity: Severity | null; acute_med: boolean | null }; onEdit: () => void }) {
  const label = entry.has_headache ? `Logged — ${entry.severity ?? "headache"}` : "Logged — pain-free";
  const tone = !entry.has_headache
    ? "bg-painfree text-painfree-foreground"
    : entry.severity === "mild" ? "bg-mild text-mild-foreground"
      : entry.severity === "moderate" ? "bg-moderate text-moderate-foreground"
        : "bg-severe text-severe-foreground";
  return (
    <div className="animate-slide-up flex w-full flex-col items-center">
      <div className={cn("animate-pop-check flex h-32 w-32 items-center justify-center rounded-full", tone)}>
        <Check className="h-16 w-16" strokeWidth={3} />
      </div>
      <p className="mt-6 text-xl font-semibold capitalize">{label}</p>
      {entry.has_headache && entry.acute_med != null ? (
        <p className="mt-1 text-sm text-muted-foreground">Acute medication: {entry.acute_med ? "Yes" : "No"}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">See you tomorrow.</p>
      )}
      <div className="mt-10 flex w-full flex-col gap-2">
        <Button variant="outline" className="h-12" onClick={onEdit}>Change today's entry</Button>
      </div>
    </div>
  );
}
