import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { token, full_name, password } = body;

    if (!token || !password || password.length < 6) {
      return NextResponse.json(
        { error: "Token and a secure password (min 6 characters) are required" },
        { status: 400 }
      );
    }

    const fullName = full_name?.trim() || "Team Operator";

    // 1. Validate invite token
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("id, email, role, expires_at, accepted_at")
      .eq("token", token.trim())
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "This invite token is invalid, expired, or does not exist." },
        { status: 404 }
      );
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been accepted." },
        { status: 400 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired. Please ask your manager for a new link." },
        { status: 400 }
      );
    }

    // 2. Create user in Supabase Auth with auto email confirmation
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: invite.role,
      },
    });

    if (createError) {
      if (
        createError.message?.toLowerCase().includes("already") ||
        createError.message?.toLowerCase().includes("exists")
      ) {
        return NextResponse.json(
          {
            error:
              "An account with this email address already exists. Please log in directly with your existing password.",
          },
          { status: 409 }
        );
      }
      throw createError;
    }

    const userId = authData.user.id;

    // 3. Update profiles table with assigned role
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        full_name: fullName,
        role: invite.role,
        is_available: true,
        active: true,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.warn("Profile upsert warning:", profileError);
    }

    // 4. Mark invite as accepted
    const { error: consumeError } = await supabase
      .from("invites")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
      })
      .eq("id", invite.id);

    if (consumeError) {
      console.warn("Invite consume warning:", consumeError);
    }

    return NextResponse.json({
      success: true,
      email: invite.email,
      role: invite.role,
    });
  } catch (err: any) {
    console.error("Signup onboarding error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to complete registration" },
      { status: 500 }
    );
  }
}
