import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell, Download, LogOut, Moon, Sun, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getProfile, upsertProfile } from "@/lib/profile.functions";
import { getAllEntries } from "@/lib/entries.functions";
import { send } from "@/lib/outbox";
import { supabase } from "@/integrations/supabase/client";
import { scheduleReminder, disableReminder, ensureNotificationPermission, notificationsEnabled, testReminder, getReminderTime } from "@/lib/reminders";
import { addDays, toISODate } from "@/lib/painless-date";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PainLess" }] }),
  component: SettingsPage,
});

type ClearPeriod = "7" | "30" | "all" | "custom";

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const upsert = useServerFn(upsertProfile);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });

  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [reminder, setReminder] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [notifOn, setNotifOn] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setAge(profile.age != null ? String(profile.age) : "");
    setGender(profile.gender ?? "");
    setReminder(profile.reminder_time ?? getReminderTime() ?? "");
    setTheme((profile.theme as "light" | "dark") ?? "dark");
  }, [profile]);

  useEffect(() => { setNotifOn(notificationsEnabled()); }, []);

  useEffect(() => {
    const d = document.documentElement;
    if (theme === "dark") d.classList.add("dark"); else d.classList.remove("dark");
    try { localStorage.setItem("painless-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  // Schedule (persisted) when enabled + time set. Do NOT clear on unmount —
  // the reminder must survive page navigation.
  useEffect(() => {
    if (!notifOn || !reminder) return;
    scheduleReminder(reminder);
  }, [reminder, notifOn]);

  const saveMut = useMutation({
    mutationFn: () => upsert({
      data: {
        name: name || null,
        age: age ? Number(age) : null,
        gender: gender || null,
        reminder_time: reminder || null,
        theme,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Saved."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  async function handleToggleNotifications(next: boolean) {
    if (next) {
      const ok = await ensureNotificationPermission();
      if (!ok) { toast.error("Notification permission denied"); return; }
      setNotifOn(true);
      if (reminder) scheduleReminder(reminder);
    } else {
      setNotifOn(false);
      disableReminder();
    }
  }

  async function handleTestNotification() {
    const ok = await testReminder();
    if (!ok) toast.error("Enable notifications first");
  }

  // ---- Change password ----
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  async function handleChangePassword() {
    if (pw1.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (pw1 !== pw2) { toast.error("Passwords don't match"); return; }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      toast.success("Password updated");
      setPw1(""); setPw2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setPwBusy(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // ---- Import / Export ----
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      const rows = await getAllEntries();
      const payload = {
        version: 1,
        app: "PainLess",
        exported_at: new Date().toISOString(),
        profile: { name, age: age ? Number(age) : null, gender: gender || null },
        entries: rows,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `painless-backup-${toISODate(new Date())}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Exported ${rows.length} entries`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function handleImportFile(f: File) {
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const list: unknown = json.entries ?? json;
      if (!Array.isArray(list)) throw new Error("Invalid backup file");
      const parsed = list.map((r: any) => ({
        date: String(r.date ?? r.entry_date),
        has_headache: !!r.has_headache,
        severity: r.severity ?? null,
      })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      if (!parsed.length) throw new Error("No valid entries found");
      await send({ kind: "import", entries: parsed });
      qc.invalidateQueries({ queryKey: ["entries"] });
      toast.success(`Imported ${parsed.length} entries`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  }

  // ---- Clear entries ----
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPeriod, setClearPeriod] = useState<ClearPeriod>("30");
  const [clearRange, setClearRange] = useState<{ from?: Date; to?: Date }>({});

  function resolveClearRange(): { start: string | null; end: string | null } | null {
    const today = new Date();
    if (clearPeriod === "all") return { start: null, end: null };
    if (clearPeriod === "7") return { start: toISODate(addDays(today, -6)), end: toISODate(today) };
    if (clearPeriod === "30") return { start: toISODate(addDays(today, -29)), end: toISODate(today) };
    if (clearPeriod === "custom" && clearRange.from && clearRange.to) {
      return { start: toISODate(clearRange.from), end: toISODate(clearRange.to) };
    }
    return null;
  }

  async function handleClearConfirm() {
    const r = resolveClearRange();
    if (!r) { toast.error("Pick a date range"); return; }
    await send({ kind: "deleteRange", start: r.start, end: r.end });
    qc.invalidateQueries({ queryKey: ["entries"] });
    setClearOpen(false);
    toast.success(r.start ? `Cleared ${r.start} → ${r.end}` : "Cleared all entries");
  }

  return (
    <AppShell title="Settings">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile</h2>
        <Card className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age">Age</Label>
              <Input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Non-binary">Non-binary</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reminders</h2>
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <Label htmlFor="notif" className="text-sm">Enable notifications</Label>
            </div>
            <Switch id="notif" checked={notifOn} onCheckedChange={handleToggleNotifications} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reminder">Daily check-in time</Label>
            <Input id="reminder" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} disabled={!notifOn} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Notifications include quick actions to log "Headache" or "No Headache". Reminders fire while PainLess is open or recently active — install to your home screen for best results.
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h2>
        <Card className="flex items-center justify-between p-4">
          <span className="text-sm">Theme</span>
          <div className="flex rounded-lg border border-border p-0.5">
            <button onClick={() => setTheme("dark")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${theme === "dark" ? "bg-accent" : ""}`}>
              <Moon className="h-3.5 w-3.5" /> Dark
            </button>
            <button onClick={() => setTheme("light")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${theme === "light" ? "bg-accent" : ""}`}>
              <Sun className="h-3.5 w-3.5" /> Light
            </button>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data</h2>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <Button variant="outline" className="h-11" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Import JSON
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <Button variant="outline" className="h-11 w-full text-destructive hover:text-destructive" onClick={() => setClearOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear log entries…
          </Button>
        </Card>
      </section>

      <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="mt-6 h-12 w-full">
        Save changes
      </Button>

      <Button onClick={signOut} variant="ghost" className="mt-3 h-11 w-full text-muted-foreground">
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">PainLess · Your data stays private in your account.</p>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear log entries</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes entries in the selected period. Cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {(["7", "30", "all", "custom"] as const).map((p) => (
                <button key={p} onClick={() => setClearPeriod(p)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${clearPeriod === p ? "border-foreground bg-accent" : "border-border"}`}>
                  {p === "7" ? "Last 7d" : p === "30" ? "Last 30d" : p === "all" ? "All time" : "Custom"}
                </button>
              ))}
            </div>
            {clearPeriod === "custom" ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    {clearRange.from && clearRange.to
                      ? `${toISODate(clearRange.from)} → ${toISODate(clearRange.to)}`
                      : "Pick date range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar mode="range" selected={{ from: clearRange.from, to: clearRange.to }}
                    onSelect={(r) => setClearRange({ from: r?.from, to: r?.to })} numberOfMonths={1}
                    className="pointer-events-auto p-3" />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
