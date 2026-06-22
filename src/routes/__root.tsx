import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { registerServiceWorker } from "@/lib/sw-register";
import { installOutboxDrainer, pendingCount } from "@/lib/outbox";
import { initReminderFromStorage } from "@/lib/reminders";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#000000" },
      { title: "PainLess — Headache Tracker" },
      { name: "description", content: "PainLess is a minimalist, private headache tracker. Log your day in seconds and share clean reports with your doctor." },
      { property: "og:title", content: "PainLess — Headache Tracker" },
      { property: "og:description", content: "PainLess is a minimalist, private headache tracker. Log your day in seconds and share clean reports with your doctor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "PainLess — Headache Tracker" },
      { name: "twitter:description", content: "PainLess is a minimalist, private headache tracker. Log your day in seconds and share clean reports with your doctor." },
      { property: "og:image", content: "/icon-512.png" },
      { name: "twitter:image", content: "/icon-512.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('painless-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark')}else{d.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const persister = typeof window !== "undefined"
  ? createAsyncStoragePersister({
      storage: {
        getItem: (k: string) => get(k).then((v) => (v == null ? null : String(v))),
        setItem: (k: string, v: string) => set(k, v),
        removeItem: (k: string) => del(k),
      },
      key: "painless-rq-cache",
      throttleTime: 1000,
    })
  : null;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    registerServiceWorker();
    initReminderFromStorage();
    installOutboxDrainer(() => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      pendingCount().then(setPending);
    });
    pendingCount().then(setPending);
    const id = setInterval(() => pendingCount().then(setPending), 5000);
    return () => { data.subscription.unsubscribe(); clearInterval(id); };
  }, [router, queryClient]);

  const inner = (
    <>
      <Outlet />
      <Toaster position="top-center" />
      {pending > 0 ? (
        <div className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-foreground/10 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {pending} change{pending === 1 ? "" : "s"} pending sync
        </div>
      ) : null}
    </>
  );

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>;
  }
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 30, buster: "v1" }}
    >
      {inner}
    </PersistQueryClientProvider>
  );
}
