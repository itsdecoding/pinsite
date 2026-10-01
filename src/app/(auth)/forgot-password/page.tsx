"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    // Basic format check
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Primary path: Call POST /api/auth/forgot-password
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (res.ok) {
        setIsSuccess(true);
        setIsLoading(false);
        return;
      }

      // If backend API route is not mounted (404), fallback seamlessly to Supabase client
      if (res.status === 404) {
        const redirectTo = "https://pinsite.pro/studio/reset-password";

        const { error: sbError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo,
        });

        if (sbError) {
          throw sbError;
        }

        setIsSuccess(true);
        setIsLoading(false);
        return;
      }

      // Backend returned an error response
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to send recovery email. Please try again.");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred. Please try again later.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#141210] flex items-center justify-center p-4 selection:bg-[#F95721]/20">
      <div className="w-full max-w-md bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-8 shadow-card dark:shadow-islandDark">
        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F95721] animate-pulse" />
          <span className="text-sm font-mono tracking-wider uppercase text-[#111110] dark:text-[#F5F3EF] font-bold">
            Pinsite
          </span>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-[#111110] dark:text-[#F5F3EF]">
          Password Recovery
        </h1>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 mb-6">
          Enter your operator email address to receive a password reset link.
        </p>

        {/* Error Alert Badge */}
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
          /* Success State */
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]">
                  Recovery email sent!
                </p>
                <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] leading-relaxed">
                  Recovery email sent! Check your inbox for the reset link.
                </p>
                <p className="text-[11px] font-mono text-[#F95721] pt-1">
                  {email}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/login"
                className="w-full py-2.5 px-4 bg-[#F95721] hover:bg-[#E04612] active:bg-[#C83B0D] text-white font-semibold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Log In
              </Link>

              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  setErrorMsg(null);
                }}
                className="w-full py-2 px-3 text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-colors text-center"
              >
                Didn&apos;t receive it? Try another address
              </button>
            </div>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9E9A93] dark:text-[#635F59]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="operator@pinsite.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] dark:focus:border-[#F95721] rounded-xl text-sm text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#9E9A93] dark:placeholder:text-[#635F59] outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full py-2.5 px-4 bg-[#F95721] hover:bg-[#E04612] active:bg-[#C83B0D] text-white font-semibold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending Recovery Link...
                </>
              ) : (
                <>
                  <span>Send Recovery Link</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer Link */}
        <div className="mt-6 pt-5 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-center text-xs">
          <span className="text-[#6E6B66] dark:text-[#8A8680] mr-1.5">
            Remember your password?
          </span>
          <Link
            href="/login"
            className="text-[#F95721] hover:underline font-medium inline-flex items-center gap-1"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
