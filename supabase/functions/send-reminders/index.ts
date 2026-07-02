// Supabase Edge Function: send-reminders
// Runs every minute (via pg_cron). For each user whose reminder_time in their
// timezone matches "now", sends a payload-less Web Push to every subscription
// belonging to them. The service worker renders the notification locally, so
// the app does NOT need to be open.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

// ---------- base64url helpers ----------
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

// ---------- VAPID JWT ----------
let cachedKey: CryptoKey | null = null;
async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pub = b64urlToBytes(VAPID_PUBLIC);
  const priv = b64urlToBytes(VAPID_PRIVATE);
  if (pub[0] !== 0x04 || pub.length !== 65) throw new Error("Invalid VAPID_PUBLIC_KEY");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: bytesToB64url(priv),
    ext: true,
  };
  cachedKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  return cachedKey;
}

async function vapidAuthHeader(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    sub: VAPID_SUBJECT,
  };
  const signingInput = `${strToB64url(JSON.stringify(header))}.${strToB64url(JSON.stringify(payload))}`;
  const key = await getPrivateKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`;
}

// ---------- Main ----------
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  const now = new Date();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, reminder_time, timezone")
    .not("reminder_time", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const dueUserIds: string[] = [];
  for (const p of profiles ?? []) {
    if (!p.reminder_time) continue;
    const tz = p.timezone || "UTC";
    let hhmm: string;
    try {
      hhmm = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
      }).format(now);
    } catch {
      hhmm = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
      }).format(now);
    }
    const localNow = hhmm.slice(0, 5);
    const target = String(p.reminder_time).slice(0, 5);
    if (localNow === target) dueUserIds.push(p.id);
  }

  if (dueUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: profiles?.length ?? 0, sent: 0 }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_id")
    .in("user_id", dueUserIds);

  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  const staleIds: string[] = [];
  const usedSubIds: string[] = [];

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
        usedSubIds.push(s.id);
      } else if (res.status === 404 || res.status === 410) {
        staleIds.push(s.id);
      } else {
        console.error("push failed", s.endpoint, res.status, await res.text().catch(() => ""));
      }
    } catch (e) {
      console.error("push error", s.endpoint, e);
    }
  }));

  if (staleIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
  if (usedSubIds.length) {
    await supabase.from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", usedSubIds);
  }

  return new Response(JSON.stringify({
    checked: profiles?.length ?? 0,
    due_users: dueUserIds.length,
    subs: subs?.length ?? 0,
    sent,
    pruned: staleIds.length,
  }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
});
