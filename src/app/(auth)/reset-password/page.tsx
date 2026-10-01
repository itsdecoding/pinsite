"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForced = searchParams.get("forced") === "true";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check for error parameters in URL hash fragment or query params (e.g. expired link)
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const errorDesc =
        hashParams.get("error_description") || searchParams.get("error_description");
      if (errorDesc) {
        setErrorMsg(decodeURIComponent(errorDesc.replace(/\+/g, " ")));
      }

      // Listen for auth state change to confirm session recovery tokens are processed
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setErrorMsg(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [searchParams, supabase]);

  // Password requirement checklist calculation
  const requirements = useMemo(() => {
    return [
      {
        id: "length",
        label: "Minimum 8 characters",
        met: password.length >= 8,
      },
      {
        id: "uppercase",
        label: "At least one uppercase letter",
        met: /[A-Z]/.test(password),
      },
      {
        id: "lowercase",
        label: "At least one lowercase letter",
        met: /[a-z]/.test(password),
      },
      {
        id: "numberOrSpecial",
        label: "At least one number or special character",
        met: /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password),
      },
    ];
  }, [password]);

  const metCount = useMemo(
    () => requirements.filter((r) => r.met).length,
    [requirements]
  );

  const strengthConfig = useMemo(() => {
    if (!password) {
      return { label: "None", percent: 0, color: "bg-black/10 dark:bg-white/10", textColor: "text-[#9E9A93]" };
    }
    if (metCount <= 1) {
      return { label: "Weak", percent: 25, color: "bg-[#EF4444]", textColor: "text-[#EF4444]" };
    }
    if (metCount === 2) {
      return { label: "Fair", percent: 50, color: "bg-[#F59E0B]", textColor: "text-[#F59E0B]" };
    }
    if (metCount === 3) {
      return { label: "Good", percent: 75, color: "bg-[#3B82F6]", textColor: "text-[#3B82F6]" };
    }
    return { label: "Strong", percent: 100, color: "bg-[#10B981]", textColor: "text-[#10B981]" };
  }, [password, metCount]);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = metCount === 4 && passwordsMatch;

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      let role = "caller";
      let apiHandled = false;

      // 1. Primary path: Attempt POST /api/auth/reset-password
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers,
          body: JSON.stringify({ password }),
        });

        if (res.ok) {
          apiHandled = true;
          const data = await res.json().catch(() => ({}));
          if (data.role) role = data.role;
        } else if (res.status !== 404 && res.status !== 401) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to update password.");
        }
      } catch (apiErr: any) {
        if (!apiErr.message?.includes("404") && !apiErr.message?.includes("401")) {
          throw apiErr;
        }
      }

      // 2. If endpoint not found or as primary auth mechanism, update via Supabase Client
      if (!apiHandled) {
        const { data: updateData, error: sbError } = await supabase.auth.updateUser({
          password,
        });

        if (sbError) {
          throw sbError;
        }

        // Clear require_password_change flag if user profile exists
        if (updateData?.user) {
          try {
            await supabase
              .from("profiles")
              .update({
                require_password_change: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", updateData.user.id);
          } catch (profileErr) {
            console.warn("Could not update require_password_change:", profileErr);
          }
        }
      }

      // 3. Query role for redirection
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.role) {
            role = profile.role;
          }
        }
      } catch (userErr) {
        // Fallback default
      }

      // Determine redirect destination according to user role:
      // caller -> /queue
      // developer -> /projects
      // manager/admin -> /dashboard
      const destination =
        role === "caller"
          ? "/queue"
          : role === "developer"
          ? "/projects"
          : "/dashboard";

      setRedirectPath(destination);
      setIsSuccess(true);
      setIsLoading(false);

      setTimeout(() => {
        router.push(destination);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update password. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-8 shadow-card dark:shadow-islandDark">
      {/* Brand Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#F95721] animate-pulse" />
        <span className="text-sm font-mono tracking-wider uppercase text-[#111110] dark:text-[#F5F3EF] font-bold">
          Pinsite
        </span>
      </div>

      <h1 className="text-xl font-bold tracking-tight text-[#111110] dark:text-[#F5F3EF]">
        Set New Password
      </h1>
      <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 mb-6">
        Create a secure password for your operator account.
      </p>

      {/* Forced Password Change Warning Banner */}
      {isForced && (
        <div
          role="alert"
          className="p-3.5 mb-5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#D97706] dark:text-[#FBBF24] text-xs flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold block mb-0.5">⚠️ Password Change Required</span>
            <span>
              You are logged in with a temporary password. Please set a new permanent password to access your workspace.
            </span>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3 mb-5 rounded-xl bg-feedback-error/10 border border-feedback-error/25 text-feedback-error text-xs flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMsg}</span>
        </div>
      )}

      {isSuccess ? (
        /* Success Notification & Redirect State */
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]">
                Password Updated Successfully
              </p>
              <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] leading-relaxed">
                Your new password has been activated. Redirecting to your workspace...
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center py-2 text-xs text-[#6E6B66] dark:text-[#8A8680] gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#F95721]" />
            <span>Redirecting now...</span>
          </div>

          {redirectPath && (
            <button
              type="button"
              onClick={() => router.push(redirectPath)}
              className="w-full py-2.5 px-4 bg-[#F95721] hover:bg-[#E04612] text-white font-semibold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              Continue to Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        /* Password Form */
        <form onSubmit={handleReset} className="space-y-4">
          {/* New Password Input */}
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9E9A93] dark:text-[#635F59]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                required
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 bg-black/[0.02] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] dark:focus:border-[#F95721] rounded-xl text-sm text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#9E9A93] dark:placeholder:text-[#635F59] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9E9A93] dark:text-[#635F59] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Real-Time Password Strength Meter */}
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6E6B66] dark:text-[#8A8680] font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#F95721]" />
                Password Strength
              </span>
              <span className={`font-semibold font-mono text-[11px] ${strengthConfig.textColor}`}>
                {strengthConfig.label}
              </span>
            </div>

            {/* Segmented Strength Bar */}
            <div className="grid grid-cols-4 gap-1.5 h-1.5">
              {[1, 2, 3, 4].map((step) => {
                const isFilled = metCount >= step;
                return (
                  <div
                    key={step}
                    className={`h-full rounded-full transition-all duration-300 ${
                      isFilled ? strengthConfig.color : "bg-black/10 dark:bg-white/10"
                    }`}
                  />
                );
              })}
            </div>

            {/* Requirements Checklist */}
            <div className="grid grid-cols-1 gap-1 pt-1.5 border-t border-[#ECE8E1]/60 dark:border-[#2D2924]/60">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  className={`flex items-center gap-2 text-[11px] transition-colors ${
                    req.met
                      ? "text-[#10B981] font-medium"
                      : "text-[#9E9A93] dark:text-[#635F59]"
                  }`}
                >
                  {req.met ? (
                    <Check className="w-3 h-3 text-[#10B981] shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-black/20 dark:bg-white/20 shrink-0 ml-0.5 mr-1" />
                  )}
                  <span>{req.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9E9A93] dark:text-[#635F59]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 bg-black/[0.02] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] dark:focus:border-[#F95721] rounded-xl text-sm text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#9E9A93] dark:placeholder:text-[#635F59] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9E9A93] dark:text-[#635F59] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Mismatch Alert Helper */}
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1.5 text-[11px] text-[#EF4444] flex items-center gap-1">
                <X className="w-3 h-3" />
                Passwords do not match
              </p>
            )}
            {confirmPassword.length > 0 && passwordsMatch && (
              <p className="mt-1.5 text-[11px] text-[#10B981] flex items-center gap-1">
                <Check className="w-3 h-3" />
                Passwords match
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || isLoading}
            className="w-full py-2.5 px-4 bg-[#F95721] hover:bg-[#E04612] active:bg-[#C83B0D] text-white font-semibold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating Password...
              </>
            ) : (
              <>
                <span>Update Password</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Footer Link */}
      <div className="mt-6 pt-5 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-center text-xs">
        <span className="text-[#6E6B66] dark:text-[#8A8680] mr-1.5">
          Already know your password?
        </span>
        <Link
          href="/login"
          className="text-[#F95721] hover:underline font-medium inline-flex items-center gap-1"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#141210] flex items-center justify-center p-4 selection:bg-[#F95721]/20">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#F95721]" />
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680]">Loading reset form...</p>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
