import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_ID = "a87c7c79-6c4c-4787-8132-8cff8f7a1e74";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { email, role } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const assignedRole = role && ["caller", "developer", "manager"].includes(role) ? role : "caller";

    // Generate atomic 16-character alphanumeric token
    const token = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Check if an unaccepted invite already exists for this email
    const { data: existing } = await supabase
      .from("invites")
      .select("id")
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let inviteRecord;
    if (existing) {
      // Update existing invite with fresh token and expiration
      const { data: updated, error: updateError } = await supabase
        .from("invites")
        .update({
          token,
          role: assignedRole,
          expires_at: expiresAt,
          invited_by: DEFAULT_ADMIN_ID,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      inviteRecord = updated;
    } else {
      // Create new invite
      const { data: created, error: insertError } = await supabase
        .from("invites")
        .insert({
          token,
          email: normalizedEmail,
          role: assignedRole,
          invited_by: DEFAULT_ADMIN_ID,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      inviteRecord = created;
    }

    // Attempt optional email dispatch via Resend REST API
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.includes("placeholder")) {
      try {
        const origin = req.headers.get("origin") || "https://pinsite20.vercel.app";
        const inviteUrl = `${origin}/signup?token=${token}`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Agency OS <onboarding@resend.dev>",
            to: [normalizedEmail],
            subject: `You're invited to join Agency OS as ${assignedRole.toUpperCase()}`,
            html: `
              <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #ECE8E1; border-radius: 16px;">
                <h2 style="color: #111110; margin-top: 0;">Welcome to Agency OS</h2>
                <p style="color: #6E6B66; font-size: 14px; line-height: 1.5;">
                  You've been invited by management to join the outreach & operations team as a <strong>${assignedRole.toUpperCase()}</strong>.
                </p>
                <div style="margin: 28px 0;">
                  <a href="${inviteUrl}" style="background-color: #F95721; color: white; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: 600; font-size: 13px; display: inline-block;">
                    Accept Invitation &rarr;
                  </a>
                </div>
                <p style="color: #9E9A93; font-size: 12px;">This single-use invite link expires in 7 days.</p>
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Invite ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete invite" }, { status: 500 });
  }
}
