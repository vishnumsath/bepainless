import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import iconAsset from "@/assets/painless-icon-192.png.asset.json";

export const APP_ICON_URL = iconAsset.url;

const items = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/history", label: "History", icon: CalendarDays },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = useLocation({ select: (s) => s.pathname });
  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/today" && pathname.startsWith(to));
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <img src={APP_ICON_URL} alt="PainLess" className="h-8 w-8 rounded-lg" />
          <h1 className="text-lg font-semibold tracking-tight">{title ?? "PainLess"}</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">{children}</main>
      <BottomNav />
    </div>
  );
}
