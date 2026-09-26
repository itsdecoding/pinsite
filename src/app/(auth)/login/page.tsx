"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Authentication failed.");

      // Check role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = profile?.role || "caller";
      if (role === "caller") router.push("/queue");
      else if (role === "developer") router.push("/projects");
      else router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log in.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 shadow-card">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-sm font-mono tracking-wider uppercase text-text-primary">
            Agency OS
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-6">
          Sign in to your operator workspace
        </p>

        {errorMsg && (
          <div className="p-3 mb-4 rounded bg-feedback-error/10 border border-feedback-error/20 text-feedback-error text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@agency.com"
              className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-sm text-text-primary placeholder:text-text-placeholder outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-sm text-text-primary placeholder:text-text-placeholder outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-background-base font-semibold text-xs uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Quick Local Preview Mode */}
        <div className="mt-6 pt-5 border-t border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-ping" />
              Instant Local Preview
            </span>
            <span className="text-[10px] text-text-muted font-mono">1-Click Access</span>
          </div>

          <p className="text-[11px] text-text-secondary mb-3 leading-relaxed">
            Testing on localhost? Click any role below to enter the workspace immediately:
          </p>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                document.cookie = "agency_demo_role=manager; path=/; max-age=86400; SameSite=Lax";
                router.push("/dashboard");
              }}
              className="py-2.5 px-2 bg-background-elevated hover:bg-background-surface border border-border-subtle hover:border-accent-primary text-text-primary text-[11px] font-medium rounded-md transition-all text-center flex flex-col items-center gap-1 shadow-sm"
            >
              <span className="text-sm">👑</span>
              <span className="font-semibold text-accent-primary">Manager</span>
              <span className="text-[9px] text-text-muted">Command Ctr</span>
            </button>
            <button
              type="button"
              onClick={() => {
                document.cookie = "agency_demo_role=caller; path=/; max-age=86400; SameSite=Lax";
                router.push("/queue");
              }}
              className="py-2.5 px-2 bg-background-elevated hover:bg-background-surface border border-border-subtle hover:border-accent-primary text-text-primary text-[11px] font-medium rounded-md transition-all text-center flex flex-col items-center gap-1 shadow-sm"
            >
              <span className="text-sm">📞</span>
              <span className="font-semibold text-accent-primary">Caller</span>
              <span className="text-[9px] text-text-muted">Dial Queue</span>
            </button>
            <button
              type="button"
              onClick={() => {
                document.cookie = "agency_demo_role=developer; path=/; max-age=86400; SameSite=Lax";
                router.push("/projects");
              }}
              className="py-2.5 px-2 bg-background-elevated hover:bg-background-surface border border-border-subtle hover:border-accent-primary text-text-primary text-[11px] font-medium rounded-md transition-all text-center flex flex-col items-center gap-1 shadow-sm"
            >
              <span className="text-sm">💻</span>
              <span className="font-semibold text-accent-primary">Developer</span>
              <span className="text-[9px] text-text-muted">Kanban Board</span>
            </button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border-subtle text-center">
          <p className="text-[11px] text-text-muted">
            For production: set your <code className="text-accent-primary text-[10px]">.env.local</code> Supabase keys and create your admin account.
          </p>
        </div>
      </div>
    </div>
  );
}
