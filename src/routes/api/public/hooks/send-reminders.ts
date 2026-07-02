import { createFileRoute } from "@tanstack/react-router";
import { vapidAuthHeader } from "@/lib/vapid.server";

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Load all profiles that have a reminder configured.
        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("id, reminder_time, timezone")
          .not("reminder_time", "is", null);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const now = new Date();
        const dueUserIds: string[] = [];

        for (const p of profiles ?? []) {
          if (!p.reminder_time) continue;
          const tz = p.timezone || "UTC";
          let hhmm: string;
          try {
            hhmm = new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: tz,
            }).format(now);
          } catch {
            hhmm = new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
            }).format(now);
          }
          // Normalize both to HH:MM
          const localNow = hhmm.slice(0, 5);
          const target = p.reminder_time.slice(0, 5);
          if (localNow === target) dueUserIds.push(p.id);
        }

        if (dueUserIds.length === 0) return Response.json({ sent: 0, checked: profiles?.length ?? 0 });

        const { data: subs, error: subErr } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, user_id")
          .in("user_id", dueUserIds);
        if (subErr) return Response.json({ error: subErr.message }, { status: 500 });

        let sent = 0;
        const staleIds: string[] = [];

        await Promise.all((subs ?? []).map(async (s) => {
          try {
            const auth = await vapidAuthHeader(s.endpoint);
            const res = await fetch(s.endpoint, {
              method: "POST",
              headers: {
                Authorization: auth,
                TTL: "3600",
                "Content-Length": "0",
                Urgency: "normal",
              },
            });
            if (res.status === 201 || res.status === 202 || res.status === 200) {
              sent++;
            } else if (res.status === 404 || res.status === 410) {
              staleIds.push(s.id);
            }
          } catch {
            /* network error — skip this cycle */
          }
        }));

        if (staleIds.length) {
          await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
        }

        return Response.json({ sent, due_users: dueUserIds.length, pruned: staleIds.length });
      },
    },
  },
});
