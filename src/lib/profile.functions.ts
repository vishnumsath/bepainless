import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, name, age, gender, reminder_time, theme, timezone")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().max(120).nullable().optional(),
        age: z.number().int().min(0).max(150).nullable().optional(),
        gender: z.string().max(40).nullable().optional(),
        reminder_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable()
          .optional(),
        theme: z.enum(["light", "dark"]).optional(),
        timezone: z.string().max(64).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = { id: context.userId, ...data };
    const { error } = await context.supabase
      .from("profiles")
      .upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
