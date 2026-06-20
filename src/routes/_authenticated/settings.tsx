import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { AppShell } from "@/components/painless/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProfile, upsertProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { scheduleReminder, clearReminder, ensureNotificationPermission } from "@/lib/reminders";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PainLess" }] }),
  component: SettingsPage,
});

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

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setAge(profile.age != null ? String(profile.age) : "");
    setGender(profile.gender ?? "");
    setReminder(profile.reminder_time ?? "");
    setTheme((profile.theme as "light" | "dark") ?? "dark");
  }, [profile]);

  // Apply theme immediately when changed
  useEffect(() => {
    const d = document.documentElement;
    if (theme === "dark") d.classList.add("dark"); else d.classList.remove("dark");
    try { localStorage.setItem("painless-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  // Schedule reminder when changed
  useEffect(() => {
    if (!reminder) { clearReminder(); return; }
    scheduleReminder(reminder);
    return () => clearReminder();
  }, [reminder]);

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

  async function handleEnableReminder() {
    const ok = await ensureNotificationPermission();
    if (!ok) toast.error("Notification permission denied");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
        <Card className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="reminder" className="flex items-center gap-2"><Bell className="h-4 w-4" /> Daily check-in time</Label>
            <Input id="reminder" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={handleEnableReminder}>Enable notifications</Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Web reminders only fire while PainLess is open. Install the app to your home screen to keep it ready.
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

      <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="mt-6 h-12 w-full">
        Save changes
      </Button>

      <Button onClick={signOut} variant="ghost" className="mt-3 h-11 w-full text-muted-foreground">
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">PainLess · Your data stays private in your account.</p>
    </AppShell>
  );
}
