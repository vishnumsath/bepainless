import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const severityEnum = z.enum(["mild", "moderate", "severe"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const upsertEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      date: dateStr,
      has_headache: z.boolean(),
      severity: severityEnum.nullable(),
      acute_med: z.boolean().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      entry_date: data.date,
      has_headache: data.has_headache,
      severity: data.has_headache ? data.severity : null,
      acute_med: data.has_headache ? (data.acute_med ?? null) : null,
    };
    const { error } = await context.supabase
      .from("log_entries")
      .upsert(row, { onConflict: "user_id,entry_date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("log_entries")
      .delete()
      .eq("user_id", context.userId)
      .eq("entry_date", data.date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEntriesInRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ start: dateStr, end: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("log_entries")
      .select("entry_date, has_headache, severity, acute_med")
      .eq("user_id", context.userId)
      .gte("entry_date", data.start)
      .lte("entry_date", data.end)
      .order("entry_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getAllEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("log_entries")
      .select("entry_date, has_headache, severity, acute_med")
      .eq("user_id", context.userId)
      .order("entry_date", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const bulkMarkNoHeadache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dates: z.array(dateStr).min(1).max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.dates.map((date) => ({
      user_id: context.userId, entry_date: date, has_headache: false, severity: null,
    }));
    const { error } = await context.supabase
      .from("log_entries")
      .upsert(rows, { onConflict: "user_id,entry_date" });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const deleteEntriesInRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ start: dateStr.nullable(), end: dateStr.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("log_entries").delete().eq("user_id", context.userId);
    if (data.start) q = q.gte("entry_date", data.start);
    if (data.end) q = q.lte("entry_date", data.end);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      entries: z.array(z.object({
        date: dateStr, has_headache: z.boolean(), severity: severityEnum.nullable(),
        acute_med: z.boolean().nullable().optional(),
      })).min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rows = data.entries.map((e) => ({
      user_id: context.userId,
      entry_date: e.date,
      has_headache: e.has_headache,
      severity: e.has_headache ? e.severity : null,
      acute_med: e.has_headache ? (e.acute_med ?? null) : null,
    }));

    // Chunk to be safe with row limits
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await context.supabase
        .from("log_entries")
        .upsert(slice, { onConflict: "user_id,entry_date" });
      if (error) throw new Error(error.message);
    }
    return { imported: rows.length };
  });
