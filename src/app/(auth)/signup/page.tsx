"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, CheckCircle2, ArrowRight, Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuantAuthBackground } from "@/components/auth/QuantAuthBackground";

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
    router.replace(`/studio/signup?token=${encodeURIComponent(tokenInput.trim())}`);
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

  if (isValidating) {
    return (
      <div className="quant-login-card flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm font-medium text-emerald-100">
          Verifying invitation token...
        </p>
      </div>
    );
  }

  if (!activeToken || !inviteData) {
    return (
      <div className="quant-login-card">
        <div className="quant-brand-badge" aria-hidden="true">
          <span className="quant-pulse-dot" />
          <span>AGENCY OS</span>
        </div>
        <h2>Seat Onboarding</h2>
        <p className="quant-subtitle">
          Registration is invite-only. Enter your assigned 16-character token below:
        </p>

        {inviteError && (
          <div className="quant-error-alert flex items-center justify-center gap-2" role="alert">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-300" />
            <span>{inviteError}</span>
          </div>
        )}

        <form onSubmit={handleManualTokenSubmit} className="space-y-4">
          <div className="quant-input-box">
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="e.g. alipathan_c2026"
              className="font-mono"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div className="quant-input-box">
            <button
              type="submit"
              id="btn"
              className="quant-btn"
              disabled={!tokenInput.trim()}
            >
              <span>Validate Token</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>

          <div className="quant-group">
            <span className="text-xs text-emerald-100/70">Already have an account?</span>
            <Link href="/studio/login" id="loginLink">
              Sign In
            </Link>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="quant-login-card quant-card-fluid">
      <h2>Activate Seat</h2>

      {/* Verified Email Banner */}
      <div className="quant-badge-container flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-100">Invited Email Verified</span>
        </div>
        <div className="flex items-center justify-between w-full pt-1">
          <span className="font-mono text-xs text-emerald-300">{inviteData.email}</span>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
            {inviteData.role}
          </span>
        </div>
      </div>

      {formError && (
        <div className="quant-error-alert" role="alert">
          {formError}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-3">
        <div className="quant-input-box">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full Name (e.g. Ali Pathan)"
            disabled={isSubmitting}
          />
        </div>

        <div className="quant-input-box">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set Password (min. 8 characters)"
            disabled={isSubmitting}
          />
        </div>

        <div className="quant-input-box">
          <button
            type="submit"
            id="btn"
            className="quant-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Activating Seat...</span>
              </>
            ) : (
              <>
                <span>Complete Registration & Enter</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>

        <div className="quant-group">
          <button
            type="button"
            onClick={() => {
              setActiveToken(null);
              setInviteData(null);
              router.replace("/studio/signup");
            }}
            className="text-xs text-emerald-200/80 hover:text-white underline bg-transparent border-none cursor-pointer p-0"
          >
            Use different token
          </button>
          <Link href="/studio/login">Back to Sign In</Link>
        </div>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <QuantAuthBackground>
      <Suspense
        fallback={
          <div className="quant-login-card flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </QuantAuthBackground>
  );
}
