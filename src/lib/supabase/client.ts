import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
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

  return browserClient;
}
