import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyManagerSession } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await req.json();
    const { userId, tempPassword } = body;

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!tempPassword || typeof tempPassword !== "string" || tempPassword.length < 8) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // Check target user exists and prevent resetting owner account
    const { data: targetUserData, error: getUserError } = await admin.auth.admin.getUserById(userId.trim());
    if (getUserError || !targetUserData?.user) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 }
      );
    }

    const targetUser = targetUserData.user;
    if (targetUser.email?.toLowerCase() === "muzammilpathan6047@gmail.com") {
      return NextResponse.json(
        { error: "Cannot reset owner account password via team management" },
        { status: 403 }
      );
    }

    // Update password in Supabase Auth
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId.trim(), {
      password: tempPassword,
    });

    if (updateAuthError) {
      return NextResponse.json(
        { error: updateAuthError.message || "Failed to update user password" },
        { status: 400 }
      );
    }

    // Update public.profiles: SET require_password_change = TRUE, temp_password_issued_at = NOW() WHERE id = userId
    const now = new Date().toISOString();
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        require_password_change: true,
        temp_password_issued_at: now,
        updated_at: now,
      })
      .eq("id", userId.trim());

    if (profileError) {
      console.error("Failed to update profile password status:", profileError);
      return NextResponse.json(
        { error: "Password was updated in auth, but failed to update profile record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Temporary password set successfully",
    });
  } catch (err: any) {
    console.error("Manager reset-password error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
