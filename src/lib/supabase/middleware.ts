import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PERSISTENT_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60, // 400 days (maximum Chrome/Safari cookie expiration)
};

/**
 * Creates a redirect response that preserves all refreshed Supabase cookies.
 * Prevents dropping refreshed access/refresh tokens which causes session loss.
 */
function createRedirect(url: URL, sourceResponse: NextResponse, status: number = 307): NextResponse {
  const redirectResponse = NextResponse.redirect(url, status);
  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      ...PERSISTENT_COOKIE_OPTIONS,
      ...cookie,
    });
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookieOptions: PERSISTENT_COOKIE_OPTIONS,
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
            supabaseResponse.cookies.set(name, value, {
              ...PERSISTENT_COOKIE_OPTIONS,
              ...options,
            })
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
    const redirectRes = createRedirect(url, supabaseResponse);
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
    pathname.startsWith("/studio/login") ||
    pathname.startsWith("/studio/signup") ||
    pathname.startsWith("/studio/forgot-password") ||
    pathname.startsWith("/studio/reset-password") ||
    pathname.startsWith("/studio/unauthorized") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/studio/auth") ||
    pathname.startsWith("/api") ||
    pathname === "/" ||
    pathname === "/studio";

  // 3. Authenticate against real Supabase session (NO demo mode bypass)
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    user = null;
  }

  // If not authenticated and trying to access protected workspace routes, redirect strictly to studio login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio/login";
    return createRedirect(url, supabaseResponse);
  }

  // For API routes, session cookies are refreshed via getUser() above.
  // API endpoints handle their own granular authorization and session verification.
  if (pathname.startsWith("/api")) {
    return supabaseResponse;
  }

  // If authenticated user is on public routes (login/signup without token, or /studio), redirect to their workspace
  if (user) {
    // 1. Fetch profile columns (role, active, require_password_change) in a single consolidated query
    let role: string | null = (user.user_metadata?.role as string) || (user.app_metadata?.role as string) || null;
    let isActive = true;
    let requirePasswordChange = false;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active, require_password_change")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        if (profile.role) role = profile.role;
        isActive = profile.active !== false;
        if (profile.require_password_change) {
          requirePasswordChange = true;
        }
      }
    } catch (e) {
      console.warn("Middleware profile lookup failed, falling back to session metadata:", e);
    }

    if (requirePasswordChange) {
      if (
        !pathname.startsWith("/reset-password") &&
        !pathname.startsWith("/studio/reset-password") &&
        pathname !== "/login" &&
        pathname !== "/studio/login" &&
        !pathname.startsWith("/api/")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/studio/reset-password";
        url.searchParams.set("forced", "true");
        return createRedirect(url, supabaseResponse, 307);
      }
    }

    // 3. Root and public route redirection for authenticated users
    if (
      pathname === "/studio" ||
      pathname === "/login" ||
      pathname === "/studio/login" ||
      ((pathname === "/signup" || pathname === "/studio/signup") && !token)
    ) {
      const url = request.nextUrl.clone();
      if (role === "caller") url.pathname = "/studio/queue";
      else if (role === "developer") url.pathname = "/studio/projects";
      else url.pathname = "/studio/dashboard";
      return createRedirect(url, supabaseResponse);
    }

    // 4. Role-based authorization boundaries (Strict: only restrict if role is explicitly identified)
    const normalizedPath = pathname.replace(/^\/studio/, "");
    if (role === "caller") {
      if (
        normalizedPath.startsWith("/dashboard") ||
        normalizedPath.startsWith("/projects") ||
        normalizedPath.startsWith("/manager")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/studio/unauthorized";
        return createRedirect(url, supabaseResponse);
      }
    }

    if (role === "developer") {
      if (
        normalizedPath.startsWith("/dashboard") ||
        normalizedPath.startsWith("/queue") ||
        normalizedPath.startsWith("/manager")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/studio/unauthorized";
        return createRedirect(url, supabaseResponse);
      }
    }
    // Admins and Managers have unrestricted access to all routes (/dashboard, /queue, /projects, /manager/*, /comms)
  }

  return supabaseResponse;
}
