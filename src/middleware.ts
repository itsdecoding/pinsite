import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (Next.js static files)
     * - _next/image (Next.js image optimization)
     * - favicon.ico
     * - Static asset extensions
     *
     * NOTE: With basePath '/studio', Next.js middleware only sees paths
     * after the basePath prefix is stripped (e.g. /studio/login → /login).
     * The landing page at / is served by Vercel as a static file — it never
     * reaches this middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
