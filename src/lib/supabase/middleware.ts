import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/unauthorized") ||
    pathname.startsWith("/api") ||
    pathname === "/";

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

    // If on root or login/signup, redirect to default landing for role
    if (pathname === "/" || pathname === "/login" || pathname === "/signup") {
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
