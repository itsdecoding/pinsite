"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, CheckCircle2, ArrowRight, Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenParam = searchParams.get("token");

  const [tokenInput, setTokenInput] = useState(tokenParam || "");
  const [activeToken, setActiveToken] = useState<string | null>(tokenParam);
  const [isValidating, setIsValidating] = useState(Boolean(tokenParam));
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{ email: string; role: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = createClient();

  // Clear any existing preview demo cookie upon visiting signup
  useEffect(() => {
    document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }, []);

  // Sync token from searchParams if it changes
  useEffect(() => {
    if (tokenParam) {
      setTokenInput(tokenParam);
      setActiveToken(tokenParam);
      validateToken(tokenParam);
    } else {
      setIsValidating(false);
    }
  }, [tokenParam]);

  async function validateToken(tokenToTest: string) {
    if (!tokenToTest || !tokenToTest.trim()) {
      setInviteError("Please enter an invitation token.");
      setInviteData(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setInviteError(null);

    try {
      const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(tokenToTest.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.valid) {
        setInviteError(data.error || "This invite token is invalid, expired, or has already been accepted.");
        setInviteData(null);
      } else {
        setInviteData({ email: data.email, role: data.role });
        setActiveToken(tokenToTest.trim());
      }
    } catch (err: any) {
      setInviteError(err.message || "Failed to validate invite token.");
      setInviteData(null);
    } finally {
      setIsValidating(false);
    }
  }

  function handleManualTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    router.replace(`/signup?token=${encodeURIComponent(tokenInput.trim())}`);
    validateToken(tokenInput.trim());
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteData || !activeToken) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      // 1. Call dedicated signup API
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: activeToken,
          full_name: fullName.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete account registration");
      }

      // 2. Automatically log the user in
      await supabase.auth.signInWithPassword({
        email: inviteData.email,
        password,
      });

      // Clear any preview cookie that might be present
      document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

      // 3. Route according to assigned role
      const assignedRole = data.role || inviteData.role;
      if (assignedRole === "caller") {
        router.push("/studio/queue");
      } else if (assignedRole === "developer") {
        router.push("/studio/projects");
      } else {
        router.push("/studio/dashboard");
      }
    } catch (err: any) {
      setFormError(err.message || "An error occurred during account creation.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 shadow-card">
      <div className="flex items-center gap-2 mb-6">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse" />
        <span className="text-sm font-mono tracking-wider uppercase text-text-primary">
          Agency OS — Seat Onboarding
        </span>
      </div>

      {isValidating ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          <p className="text-xs">Verifying invitation token...</p>
        </div>
      ) : !activeToken || !inviteData ? (
        <div className="space-y-4">
          {inviteError && (
            <div className="p-4 rounded-lg bg-feedback-error/10 border border-feedback-error/20 flex items-start gap-3 text-feedback-error">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold text-sm">Access Denied</p>
                <p className="mt-1">{inviteError}</p>
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-background-elevated border border-border-subtle">
            <h3 className="text-xs font-semibold text-text-primary flex items-center gap-2 mb-1.5">
              <KeyRound className="w-4 h-4 text-accent-primary" />
              Enter Invite Token
            </h3>
            <p className="text-[11px] text-text-muted leading-relaxed mb-3">
              Seat registration is strictly invite-only. Paste your assigned 16-character token below:
            </p>

            <form onSubmit={handleManualTokenSubmit} className="space-y-3">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="e.g. alipathan_c2026"
                className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-xs font-mono text-text-primary placeholder:text-text-placeholder outline-none"
              />
              <button
                type="submit"
                disabled={!tokenInput.trim()}
                className="w-full py-2 px-3 bg-accent-primary hover:bg-accent-hover text-background-base font-semibold text-xs uppercase tracking-wider rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Validate Token &rarr;
              </button>
            </form>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="p-3.5 rounded-lg bg-accent-subtle border border-accent-border flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent-primary shrink-0" />
            <div className="text-xs">
              <p className="text-text-primary font-medium">Invited Email Verified</p>
              <p className="text-text-secondary font-mono text-[11px]">{inviteData.email}</p>
              <span className="inline-block mt-1 text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-background-base text-accent-primary border border-accent-border font-bold">
                Assigned Role: {inviteData.role}
              </span>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded bg-feedback-error/10 border border-feedback-error/20 text-feedback-error text-xs">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ali Pathan"
              className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-sm text-text-primary placeholder:text-text-placeholder outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Set Account Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-sm text-text-primary placeholder:text-text-placeholder outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-background-base font-semibold text-xs uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Activating Seat...
              </>
            ) : (
              <>
                Complete Registration & Enter
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </div>
  );
}
