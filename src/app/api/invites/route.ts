import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

async function verifyManagerSession(req: NextRequest) {
  // 1. Check cookies session
  const serverSupabase = createServerClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  let activeUser = user;

  // 2. Check Bearer token in header if no cookie session
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
    return { error: "Unauthorized: Active session required", status: 401 };
  }

  // 3. Verify user has manager or admin privileges
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", activeUser.id)
    .maybeSingle();

  const role = profile?.role || "caller";
  if (role !== "admin" && role !== "manager") {
    return { error: "Forbidden: Manager or Admin role required", status: 403 };
  }

  return { user: activeUser, role };
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("invites")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ invites: data || [] });
  } catch (err: any) {
    console.error("Failed to fetch invites:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch invites" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const admin = getAdminClient();
    const body = await req.json();
    const { email, role } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const assignedRole = role && ["caller", "developer", "manager"].includes(role) ? role : "caller";

    // Prevent creating invite for email that already has an account
    const { data: listData } = await admin.auth.admin.listUsers();
    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );
    if (existingUser) {
      return NextResponse.json(
        { error: "A team member with this email address is already registered." },
        { status: 409 }
      );
    }

    // Generate atomic 16-character alphanumeric token
    const token = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const currentUserId = authResult.user.id;

    // Check if an unaccepted invite already exists for this email
    const { data: existingInvite } = await admin
      .from("invites")
      .select("id")
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let inviteRecord;
    if (existingInvite) {
      // Refresh existing invite with fresh token and expiration
      const { data: updated, error: updateError } = await admin
        .from("invites")
        .update({
          token,
          role: assignedRole,
          expires_at: expiresAt,
          invited_by: currentUserId,
        })
        .eq("id", existingInvite.id)
        .select()
        .single();

      if (updateError) throw updateError;
      inviteRecord = updated;
    } else {
      // Create new invite
      const { data: created, error: insertError } = await admin
        .from("invites")
        .insert({
          token,
          email: normalizedEmail,
          role: assignedRole,
          invited_by: currentUserId,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      inviteRecord = created;
    }

    // Dynamic origin resolution — automatically ensures /studio/signup path without needing Vercel env var
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || req.headers.get("origin") || "https://pinsite.pro";
    const baseOrigin = appUrl.replace(/\/studio\/?$/, "").replace(/\/+$/, "");
    const inviteUrl = `${baseOrigin}/studio/signup?token=${token}`;

    // Optional email dispatch via Resend REST API
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.includes("placeholder")) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || "Pinsite <invites@pinsite.pro>";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [normalizedEmail],
            subject: `You're invited to join Pinsite as ${assignedRole.toUpperCase()}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; border: 1px solid #ECE8E1; border-radius: 20px; background-color: #FAF8F5;">
                <div style="margin-bottom: 24px;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #F95721; font-family: monospace;">Pinsite Workspace</span>
                </div>
                <h2 style="color: #111110; margin-top: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Welcome to Pinsite</h2>
                <p style="color: #6E6B66; font-size: 14px; line-height: 1.6; margin: 12px 0 24px 0;">
                  You've been invited by management to join the outreach & operations team as a <strong style="color: #111110;">${assignedRole.toUpperCase()}</strong>.
                </p>
                <div style="margin: 28px 0;">
                  <a href="${inviteUrl}" style="background-color: #F95721; color: white; padding: 13px 28px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 4px 12px rgba(249, 87, 33, 0.25);">
                    Accept Invitation &rarr;
                  </a>
                </div>
                <p style="color: #9E9A93; font-size: 12px; margin-top: 32px; border-top: 1px solid #ECE8E1; padding-top: 16px;">
                  This single-use invite link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
                </p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn("Resend email delivery skipped or failed:", emailErr);
      }
    }

    return NextResponse.json({ invite: inviteRecord }, { status: 201 });
  } catch (err: any) {
    console.error("Invite generation error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate invite" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Invite ID is required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error } = await admin.from("invites").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete invite" }, { status: 500 });
  }
}
