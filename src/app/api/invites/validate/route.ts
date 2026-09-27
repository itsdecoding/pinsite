import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    return NextResponse.json({ valid: false, error: err.message || "Failed to validate token" }, { status: 500 });
  }
}
