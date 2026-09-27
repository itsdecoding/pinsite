"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [isValidating, setIsValidating] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{ email: string; role: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function validate() {
      if (!token) {
        setInviteError("Registration is strictly invite-only. A valid token parameter is required.");
        setIsValidating(false);
        return;
      }

      try {
        const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok || !data.valid) {
          setInviteError(data.error || "This invite token is invalid, expired, or has already been accepted.");
        } else {
          setInviteData({ email: data.email, role: data.role });
        }
      } catch (err: any) {
        setInviteError(err.message || "Failed to validate invite token.");
      } finally {
        setIsValidating(false);
      }
    }

    validate();
  }, [token]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteData || !token) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      // 1. Call dedicated signup API
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
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

      // 3. Route according to assigned role
      const assignedRole = data.role || inviteData.role;
      if (assignedRole === "caller") {
        router.push("/queue");
      } else if (assignedRole === "developer") {
        router.push("/projects");
      } else {
        router.push("/dashboard");
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
          Agency OS — Registration
        </span>
      </div>

      {isValidating ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          <p className="text-xs">Verifying authorization token...</p>
        </div>
      ) : inviteError ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-feedback-error/10 border border-feedback-error/20 flex items-start gap-3 text-feedback-error">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-sm">Access Denied</p>
              <p className="mt-1">{inviteError}</p>
            </div>
          </div>
          <p className="text-xs text-text-muted text-center">
            Please contact your operations manager for a secure onboarding link.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-text-primary hover:text-accent-primary bg-background-surface hover:bg-background-elevated rounded-md border border-border-subtle transition-colors"
            >
              Return to Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="p-3 rounded-lg bg-accent-subtle border border-accent-border flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-accent-primary shrink-0" />
            <div className="text-xs">
              <p className="text-text-primary font-medium">Invited Email Confirmed</p>
              <p className="text-text-secondary font-mono">{inviteData?.email}</p>
              <span className="inline-block mt-1 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-background-base text-accent-primary border border-accent-border">
                Role: {inviteData?.role}
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
              placeholder="e.g. Alex Morgan"
              className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-sm text-text-primary placeholder:text-text-placeholder outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Account Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
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
                Activate Account & Enter
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
