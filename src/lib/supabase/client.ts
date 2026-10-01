import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        maxAge: 400 * 24 * 60 * 60, // 400 days persistent auth cookie
      },
    }
  );
}
