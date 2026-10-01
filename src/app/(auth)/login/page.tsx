"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn, Loader2, ArrowRight, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // If visiting /login with an invite token, seamlessly redirect to /signup
  useEffect(() => {
    if (token) {
      router.replace(`/signup?token=${encodeURIComponent(token)}`);
    }
  }, [token, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
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
      setErrorMsg(err.message || "Invalid email or password.");
      setIsLoading(false);
    }
  }

  if (token) {
    return (
      <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <p className="text-xs text-text-secondary">Redirecting to invite registration...</p>
      </div>
    );
  }

  return (
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-text-secondary">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[#F95721] hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>
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

      {/* Invite onboarding prompt */}
      <div className="mt-6 pt-5 border-t border-border-subtle flex items-center justify-between text-xs">
        <span className="text-text-muted flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5 text-accent-primary" />
          Received an invitation?
        </span>
        <Link
          href="/signup"
          className="text-accent-primary hover:underline font-medium flex items-center gap-1"
        >
          Activate Seat <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
