import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const token = request.nextUrl.searchParams.get("token");

  // 1. If user navigates to /login or root with an invite token, forward to /signup
  if ((pathname === "/login" || pathname === "/") && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    const redirectRes = NextResponse.redirect(url);
    // Delete any obsolete demo cookie if present
    redirectRes.cookies.set("agency_demo_role", "", { maxAge: 0, path: "/" });
    return redirectRes;
  }

  // 2. If user is on /signup with a token, let them proceed to registration
  if (pathname.startsWith("/signup") && token) {
    supabaseResponse.cookies.set("agency_demo_role", "", { maxAge: 0, path: "/" });
    return supabaseResponse;
  }

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/unauthorized") ||
    pathname.startsWith("/api") ||
    pathname === "/";

  // 3. Authenticate against real Supabase session (NO demo mode bypass)
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    user = null;
  }

  // If not authenticated and trying to access protected workspace routes, redirect strictly to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated user is on public routes (login/signup without token, or /studio), redirect to their workspace
  if (user) {
    // 1. Fetch guaranteed profile columns (role, active)
    let role: string | null = (user.user_metadata?.role as string) || (user.app_metadata?.role as string) || null;
    let isActive = true;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role) {
        role = profile.role;
        isActive = profile.active !== false;
      }
    } catch (e) {
      console.warn("Middleware profile lookup failed, falling back to session metadata:", e);
    }

    // 2. Defensively check require_password_change (safely ignore if column does not exist yet)
    let requirePasswordChange = false;
    try {
      const { data: pwdProfile, error: pwdErr } = await supabase
        .from("profiles")
        .select("require_password_change")
        .eq("id", user.id)
        .maybeSingle();

      if (!pwdErr && pwdProfile?.require_password_change) {
        requirePasswordChange = true;
      }
    } catch {
      // Column does not exist yet prior to migration; fail open safely
    }

    if (requirePasswordChange) {
      if (!pathname.startsWith("/reset-password") && pathname !== "/login" && !pathname.startsWith("/api/")) {
        const url = request.nextUrl.clone();
        url.pathname = "/reset-password";
        url.searchParams.set("forced", "true");
        return NextResponse.redirect(url, 307);
      }
    }

    // 3. Root and public route redirection for authenticated users
    if (pathname === "/studio" || pathname === "/login" || (pathname === "/signup" && !token)) {
      const url = request.nextUrl.clone();
      if (role === "caller") url.pathname = "/queue";
      else if (role === "developer") url.pathname = "/projects";
      else url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // 4. Role-based authorization boundaries (Strict: only restrict if role is explicitly identified)
    if (role === "caller") {
      if (
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/manager")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
    }

    if (role === "developer") {
      if (
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/queue") ||
        pathname.startsWith("/manager")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
    }
    // Admins and Managers have unrestricted access to all routes (/dashboard, /queue, /projects, /manager/*, /comms)
  }

  return supabaseResponse;
}
