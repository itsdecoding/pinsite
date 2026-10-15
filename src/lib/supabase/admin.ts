import { createClient as createAdminClient, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

let cachedAdminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase admin environment variables");
  }
  cachedAdminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedAdminClient;
}

export interface UserProfileSummary {
  id: string;
  role: string;
  full_name: string | null;
  [key: string]: any;
}

export type VerifyApiSessionSuccess = {
  user: User;
  role: string;
  profile: UserProfileSummary | null;
  fullName: string;
  admin: SupabaseClient;
};

export type VerifyApiSessionError = {
  error: string;
  status: number;
};

export type VerifyApiSessionResult = VerifyApiSessionSuccess | VerifyApiSessionError;

export async function verifyApiSession(
  req: NextRequest,
  options?: {
    requiredRoles?: string[];
  }
): Promise<VerifyApiSessionResult> {
  let user: User | null = null;
  try {
    const serverSupabase = createServerClient();
    const { data } = await serverSupabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const admin = getAdminClient();

  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      try {
        const { data: jwtData } = await admin.auth.getUser(token);
        user = jwtData?.user ?? null;
      } catch {
        user = null;
      }
    }
  }

  if (!user) {
    return { error: "Unauthorized: Active session required", status: 401 };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "caller";
  const fullName = profile?.full_name || "Team Member";

  if (options?.requiredRoles && options.requiredRoles.length > 0) {
    if (!options.requiredRoles.includes(role)) {
      const isManagerOrAdminOnly =
        options.requiredRoles.includes("admin") &&
        options.requiredRoles.includes("manager") &&
        options.requiredRoles.length === 2;
      return {
        error: isManagerOrAdminOnly
          ? "Forbidden: Manager or Admin role required"
          : `Forbidden: Requires one of [${options.requiredRoles.join(", ")}] role`,
        status: 403,
      };
    }
  }

  return {
    user,
    role,
    profile,
    fullName,
    admin,
  };
}

export async function verifyManagerSession(req: NextRequest): Promise<VerifyApiSessionResult> {
  return verifyApiSession(req, { requiredRoles: ["admin", "manager"] });
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<{
  user: User;
  role: string;
  fullName: string;
  profile: UserProfileSummary | null;
  admin: SupabaseClient;
} | null> {
  const result = await verifyApiSession(req);
  if ("error" in result) {
    return null;
  }
  return {
    user: result.user,
    role: result.role,
    fullName: result.fullName,
    profile: result.profile,
    admin: result.admin,
  };
}
