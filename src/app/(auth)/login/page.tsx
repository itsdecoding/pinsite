"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuantAuthBackground } from "@/components/auth/QuantAuthBackground";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // If visiting /login with an invite token, seamlessly redirect to /signup
  useEffect(() => {
    if (token) {
      router.replace(`/studio/signup?token=${encodeURIComponent(token)}`);
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

      // Check role and redirect accordingly
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = profile?.role || "caller";
      if (role === "caller") router.push("/studio/queue");
      else if (role === "developer") router.push("/studio/projects");
      else router.push("/studio/dashboard");
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid email or password.");
      setIsLoading(false);
    }
  }

  if (token) {
    return (
      <div className="quant-login-card flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm font-medium text-emerald-100">
          Redirecting to invite registration...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleLogin} className="quant-login-card" noValidate>
      <div className="quant-brand-badge" aria-hidden="true">
        <span className="quant-pulse-dot" />
        <span>AGENCY OS</span>
      </div>

      <h2>Sign In</h2>
      <p className="quant-subtitle">
        Enter your credentials to access your operator workspace.
      </p>

      {errorMsg && (
        <div className="quant-error-alert" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="quant-input-box">
        <input
          type="email"
          id="emailInput"
          placeholder="Work Email (name@agency.com)"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="quant-input-box">
        <input
          type={showPassword ? "text" : "password"}
          id="passwordInput"
          className="quant-input-password"
          placeholder="Password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="button"
          className="quant-pwd-toggle"
          onClick={() => setShowPassword((prev) => !prev)}
          title={showPassword ? "Hide password" : "Show password"}
          aria-label={showPassword ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5 text-emerald-800" />
          ) : (
            <Eye className="w-5 h-5 text-emerald-800" />
          )}
        </button>
      </div>

      <div className="quant-input-box">
        <button
          type="submit"
          id="btn"
          className="quant-btn"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>
      </div>

      <div className="quant-group">
        <Link href="/studio/forgot-password" id="forgetPasswordLink">
          Forgot password?
        </Link>
        <Link href="/studio/signup" id="signUpLink" className="flex items-center gap-1">
          <span>Activate Seat</span>
          <ArrowRight className="w-3.5 h-3.5 inline ml-0.5" />
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <QuantAuthBackground>
      <Suspense
        fallback={
          <div className="quant-login-card flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </QuantAuthBackground>
  );
}
