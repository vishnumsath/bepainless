import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PainLess" },
      { name: "description", content: "Sign in to PainLess to track your headaches privately." },
    ],
  }),
  ssr: false,
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/today", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset email sent. Check your inbox.");
        setMode("signin");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/today", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message || "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/today", replace: true });
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">PainLess</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot" ? "Reset your password" : "Track headaches in 3 seconds a day."}
          </p>
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode !== "forgot" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" ? (
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted-foreground hover:text-foreground">
                    Forgot?
                  </button>
                ) : null}
              </div>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </div>
          ) : null}
          <Button type="submit" disabled={loading} className="h-12 w-full text-base">
            {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </Button>
        </form>

        {mode !== "forgot" ? (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" onClick={handleGoogle} disabled={loading} className="h-12 w-full text-base">
              Continue with Google
            </Button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setMode(mode === "forgot" ? "signin" : mode === "signup" ? "signin" : "signup")}
          className="mt-6 block w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "forgot"
            ? "← Back to sign in"
            : mode === "signup"
              ? "Have an account? Sign in"
              : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}
