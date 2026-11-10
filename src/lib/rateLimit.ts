import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function isRateLimited(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await getAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === false;
  } catch (err) {
    console.error("Rate limit check failed:", err);
    return false;
  }
}
