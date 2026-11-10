import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (await isRateLimited(`invite-validate:${getClientIp(req)}`, 30, 3600)) {
      return NextResponse.json({ valid: false, error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const supabase = getAdminClient();

    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 });
    }

    const { data: invite, error } = await supabase
      .from("invites")
      .select("id, email, role, expires_at, accepted_at")
      .eq("token", token.trim())
      .maybeSingle();

    if (error || !invite) {
      return NextResponse.json({
        valid: false,
        error: "This invite token is invalid, expired, or does not exist.",
      }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({
        valid: false,
        error: "This invitation has already been accepted.",
      }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({
        valid: false,
        error: "This invitation has expired. Please ask your manager for a new link.",
      }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      email: invite.email,
      role: invite.role,
    });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: "Failed to validate token" }, { status: 500 });
  }
}
