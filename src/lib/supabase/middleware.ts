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

  const demoRole = request.cookies.get("agency_demo_role")?.value;
  const pathname = request.nextUrl.pathname;
  const token = request.nextUrl.searchParams.get("token");

  // 1. If user navigates to /login or root with an invite token, seamlessly forward to /signup
  if ((pathname === "/login" || pathname === "/") && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    const redirectRes = NextResponse.redirect(url);
    // Clear demo role cookie so invited user can register fresh
    redirectRes.cookies.set("agency_demo_role", "", { maxAge: 0, path: "/" });
    return redirectRes;
  }

  // 2. If user is on /signup with a token, always let them view signup page (do not redirect away)
  if (pathname.startsWith("/signup") && token) {
    supabaseResponse.cookies.set("agency_demo_role", "", { maxAge: 0, path: "/" });
    return supabaseResponse;
  }

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/unauthorized") ||
    pathname.startsWith("/api") ||
    pathname === "/";

  // Demo mode support for local previews
  if (demoRole) {
    const role = demoRole;
    if (pathname === "/" || pathname === "/login" || (pathname === "/signup" && !token)) {
      const url = request.nextUrl.clone();
      if (role === "caller") url.pathname = "/queue";
      else if (role === "developer") url.pathname = "/projects";
      else url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (role === "caller" && (pathname.startsWith("/dashboard") || pathname.startsWith("/projects") || pathname.startsWith("/manager"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }

    if (role === "developer" && (pathname.startsWith("/dashboard") || pathname.startsWith("/queue") || pathname.startsWith("/manager"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    // If Supabase credentials are placeholder or network fails
    user = null;
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role || "caller";

    // If on root or login/signup, redirect to default landing for role (unless validating an invite token)
    if (pathname === "/" || pathname === "/login" || (pathname === "/signup" && !token)) {
      const url = request.nextUrl.clone();
      if (role === "caller") url.pathname = "/queue";
      else if (role === "developer") url.pathname = "/projects";
      else url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Role-based protection:
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
