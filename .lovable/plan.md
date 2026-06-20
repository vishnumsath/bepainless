
# PainLess — Plan

A minimalist headache-tracker PWA. Pure-black dark mode by default (light toggle in Settings), oversized tap targets, ~250ms transitions. Installable to the Android home screen; offline page shell only (data is synced, so logging needs network). Data is per-user in Lovable Cloud.

## Tech
- TanStack Start + React + Tailwind (existing stack), shadcn components
- Lovable Cloud (auth + Postgres) — email/password + Google sign-in
- PWA: manifest + icons (no offline service worker — keeps preview safe)
- Daily reminder: Web Notifications API + in-app scheduler (fires when the PWA is open/recent; tapping the notification opens the check-in)
- JPG export: HTML canvas rendered with the browser Canvas API, downloaded as `painless-summary.jpg`

## Database (Lovable Cloud)
- `profiles` (id = auth.uid, name, age, gender, reminder_time, theme) — RLS owner-only
- `log_entries` (user_id, entry_date, has_headache bool, severity text nullable: mild/moderate/severe) — unique (user_id, entry_date), RLS owner-only
- `user_roles` (separate, with `has_role` security-definer function — per platform rules, even if unused now)

## Routes
- `/auth` — sign in / sign up (email + Google)
- `/_authenticated/` layout (managed)
  - `/` Home check-in (YES/NO → severity overlay → "Logged!" state)
  - `/history` Monthly calendar grid with colored dots; tap day → bottom sheet to edit/delete
  - `/stats` 7d / 30d / Custom range; gap-warning card with "Mark all as No Headache"; totals + severity breakdown; "Export Summary as JPG"
  - `/settings` Profile (name/age/gender), theme toggle, reminder time, sign out

## Color tokens (in `src/styles.css`)
- bg `#000` (dark) / `#fff` (light); severity tokens — mild `#F1C40F`, moderate `#E67E22`, severe `#C0392B`, painfree `#27AE60`
- All component colors via semantic tokens, no hardcoded hex in JSX

## Server functions (`src/lib/*.functions.ts`, `requireSupabaseAuth`)
- `upsertEntry({date, has_headache, severity})` — single-row upsert
- `deleteEntry({date})`
- `getEntriesInRange({start, end})` — calendar + stats
- `bulkMarkNoHeadache({dates[]})` — single transaction
- `getProfile` / `upsertProfile`

## JPG export (client-side)
White background, dark text, vertical layout: header (app name, date range, patient name/age/gender), big Total Headache vs Pain-Free numbers, stacked severity bars with labels, day-by-day color matrix. Rendered to an offscreen `<canvas>` (1200×1600), exported with `toBlob('image/jpeg', 0.95)`, saved via anchor download.

## Reminders (web reality)
Settings has a time picker. While the app is open we use `setTimeout` to fire a `Notification` at that time (requesting permission first). Notification click focuses the app on `/`. Lock-screen quick actions aren't possible in a PWA — this is called out in the Settings copy.

## PWA
- `public/manifest.webmanifest` with name, short_name, theme/bg `#000000`, display `standalone`, icons (192/512, generated)
- `<link rel="manifest">`, theme-color, apple-touch-icon in `__root.tsx` head
- No service worker (per platform PWA guidance — manifest-only for installability)

## Out of scope (web limits)
- Native Yes/No quick-action notifications on the lock screen
- Raw SQLite file export/import (replaced by synced cloud account)
- True offline data entry

## File layout (new)
```
src/routes/_authenticated/index.tsx        # Home check-in
src/routes/_authenticated/history.tsx      # Calendar
src/routes/_authenticated/stats.tsx        # Analysis + export
src/routes/_authenticated/settings.tsx     # Profile / reminders / theme
src/routes/auth.tsx
src/components/painless/*                  # CheckIn, SeverityPicker, MonthGrid, DayEditorSheet, GapWarning, SeverityBars, ExportButton, BottomNav
src/lib/entries.functions.ts
src/lib/profile.functions.ts
src/lib/export-jpg.ts
src/lib/reminders.ts
public/manifest.webmanifest, public/icon-192.png, public/icon-512.png
```

## Build order
1. Enable Lovable Cloud + auth (email + Google), migrations for `profiles` / `log_entries` / roles
2. Design tokens + theme toggle, bottom nav shell
3. Home check-in flow + Settings profile
4. History calendar + day editor sheet
5. Stats with gap-warning + bulk insert
6. JPG export
7. PWA manifest + icons + reminder scheduler
