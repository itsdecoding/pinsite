"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuantAuthBackground } from "@/components/auth/QuantAuthBackground";

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
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/studio/reset-password`
            : "https://pinsite.pro/studio/reset-password";

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
    <QuantAuthBackground>
      <div className="quant-login-card">
        <div className="quant-brand-badge" aria-hidden="true">
          <span className="quant-pulse-dot" />
          <span>AGENCY OS</span>
        </div>
        <h2>Password Recovery</h2>

        {errorMsg && (
          <div className="quant-error-alert" role="alert">
            {errorMsg}
          </div>
        )}

        {isSuccess ? (
          /* Success State */
          <div>
            <div className="quant-success-card">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <h3>Recovery Email Dispatched</h3>
              <p>Check your inbox for your secure password reset link.</p>
              <div className="quant-recipient-email">{email}</div>
            </div>

            <div className="space-y-3">
              <Link
                href="/studio/login"
                className="quant-input-box block text-decoration-none"
              >
                <button type="button" className="quant-btn">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span>Return to Log In</span>
                </button>
              </Link>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSuccess(false);
                    setErrorMsg(null);
                  }}
                  className="text-xs text-emerald-200/80 hover:text-white underline transition-colors cursor-pointer bg-transparent border-none py-1"
                >
                  Didn&apos;t receive it? Try another address
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleSubmit} noValidate>
            <p className="quant-subtitle">
              Enter your operator email address to receive a secure password reset link.
            </p>

            <div className="quant-input-box">
              <input
                id="email"
                type="email"
                required
                autoFocus
                placeholder="operator@agency.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={isLoading}
              />
            </div>

            <div className="quant-input-box">
              <button
                type="submit"
                id="btn"
                className="quant-btn"
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Sending Recovery Link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Recovery Link</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>

            <div className="quant-group">
              <span className="text-xs text-emerald-100/70">
                Remember your password?
              </span>
              <Link href="/studio/login" id="loginLink">
                Log In
              </Link>
            </div>
          </form>
        )}
      </div>
    </QuantAuthBackground>
  );
}
