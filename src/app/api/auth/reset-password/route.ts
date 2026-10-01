import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user session via Supabase server client (cookies) or Bearer token
    let activeUser = null;

    try {
      const serverSupabase = createServerClient();
      const {
        data: { user: cookieUser },
      } = await serverSupabase.auth.getUser();
      activeUser = cookieUser;
    } catch {
      activeUser = null;
    }

    if (!activeUser) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const admin = getAdminClient();
        const { data: jwtData } = await admin.auth.getUser(token);
        activeUser = jwtData.user;
      }
    }

    if (!activeUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required to reset password" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const newPassword = body.password || body.newPassword;

    // Validate password (min 8 chars)
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // Security Rule: Protect Super Admin account from accidental password resets
    if (
      activeUser.email?.toLowerCase() === "muzammilpathan6047@gmail.com" ||
      activeUser.id === "a87c7c79-6c4c-4787-8132-8cff8f7a1e74"
    ) {
      return NextResponse.json(
        { error: "Forbidden: The Workspace Super Admin account password is protected and cannot be modified." },
        { status: 403 }
      );
    }

    // 2. Update password in Supabase Auth
    const { error: authError } = await admin.auth.admin.updateUserById(activeUser.id, {
      password: newPassword,
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Failed to update password" },
        { status: 400 }
      );
    }

    // 3. Atomically update public.profiles: SET require_password_change = FALSE WHERE id = user.id
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        require_password_change: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeUser.id);

    if (profileError) {
      console.error("Failed to update profile require_password_change flag:", profileError);
    }

    // 4. Retrieve profile role for workspace routing
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", activeUser.id)
      .maybeSingle();

    const role = profile?.role || "caller";

    return NextResponse.json({
      success: true,
      role,
    });
  } catch (err: any) {
    console.error("Reset-password handler error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
