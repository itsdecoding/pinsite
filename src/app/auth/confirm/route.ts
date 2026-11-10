import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = (searchParams.get("type") as EmailOtpType) || "recovery";
  const requestedNext = searchParams.get("next");
  const next =
    requestedNext && /^\/(?![/\\])/.test(requestedNext) ? requestedNext : "/studio/reset-password";

  const redirectUrl = new URL(next, request.url);
  if (redirectUrl.origin !== new URL(request.url).origin) {
    redirectUrl.href = new URL("/studio/reset-password", request.url).href;
  }

  const cookiesToSet: { name: string; value: string; options?: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.push(...cookies);
        },
      },
    }
  );

  // 1. Verify token_hash OTP (robust SSR recovery mechanism)
  if (token_hash) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error && data?.session) {
      const response = NextResponse.redirect(redirectUrl);
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          path: "/",
          sameSite: "lax",
          maxAge: 400 * 24 * 60 * 60,
          secure: process.env.NODE_ENV === "production",
          ...options,
        });
      });
      return response;
    }

    console.warn("Auth confirm verifyOtp error:", error?.message);
    redirectUrl.searchParams.set(
      "error",
      error?.message || "This recovery link is invalid or has expired."
    );
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Exchange PKCE code if provided
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session) {
      const response = NextResponse.redirect(redirectUrl);
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          path: "/",
          sameSite: "lax",
          maxAge: 400 * 24 * 60 * 60,
          secure: process.env.NODE_ENV === "production",
          ...options,
        });
      });
      return response;
    }

    console.warn("Auth confirm exchangeCode error:", error?.message);
    redirectUrl.searchParams.set(
      "error",
      error?.message || "Failed to exchange reset code. Please request a new link."
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL("/studio/login", request.url));
}
