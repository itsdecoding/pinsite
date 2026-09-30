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
    pathname.startsWith("/unauthorized") ||
    pathname.startsWith("/api") ||
    pathname === "/" ||
    pathname.startsWith("/landing.html");

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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role || "caller";

    if (pathname === "/studio" || pathname === "/login" || (pathname === "/signup" && !token)) {
      const url = request.nextUrl.clone();
      if (role === "caller") url.pathname = "/queue";
      else if (role === "developer") url.pathname = "/projects";
      else url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Role-based authorization boundaries:
    // Callers: can access /queue, /comms, /me. Blocked from /dashboard, /projects, /manager
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

    // Developers: can access /projects, /comms, /me. Blocked from /dashboard, /queue, /manager
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
  }

  return supabaseResponse;
}
