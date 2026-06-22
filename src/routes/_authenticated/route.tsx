// Protected layout. Offline-aware: falls back to cached session when the
// network is unreachable so the installed PWA still opens without internet.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!online) {
      // Offline: trust persisted session in localStorage. If absent, send to /auth
      // (which is precached and will at least render).
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/auth" });
      return { user: data.session.user };
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      return { user: data.user };
    } catch (e) {
      // Network blip during validation: don't blow away an installed session.
      const { data } = await supabase.auth.getSession();
      if (data.session) return { user: data.session.user };
      throw e;
    }
  },
  component: () => <Outlet />,
});
