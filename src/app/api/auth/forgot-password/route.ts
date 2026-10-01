import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string" || !email.trim() || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const admin = getAdminClient();

    // Resolve base application URL for redirection
    const rawAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.nextUrl?.origin ||
      req.headers.get("origin") ||
      "https://pinsite.pro";
    const appUrl = rawAppUrl.replace(/\/studio\/?$/, "").replace(/\/+$/, "");
    const redirectTo = `${appUrl}/studio/reset-password`;

    // Generate recovery link via Supabase Admin Client
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });

    if (linkError) {
      // Log for observability but do not leak to client
      console.warn("Recovery link generation failed or user not found:", linkError.message);
    } else if (linkData?.properties?.action_link) {
      // Verify account profile is not soft-deleted or inactive if profile exists
      let shouldSend = true;
      if (linkData.user?.id) {
        const { data: profile } = await admin
          .from("profiles")
          .select("active")
          .eq("id", linkData.user.id)
          .maybeSingle();

        if (profile && profile.active === false) {
          shouldSend = false;
        }
      }

      if (shouldSend) {
        let actionLink = linkData.properties.action_link;
        // Bulletproof guard: Ensure redirect_to parameter explicitly points to /studio/reset-password
        if (actionLink && !actionLink.includes("/studio/reset-password")) {
          actionLink = actionLink.replace(
            /redirect_to=[^&]*/,
            `redirect_to=${encodeURIComponent(`${appUrl}/studio/reset-password`)}`
          );
        }

        const resendKey = process.env.RESEND_API_KEY;

        if (resendKey && !resendKey.includes("placeholder")) {
          try {
            const fromEmail = process.env.RESEND_FROM_EMAIL || "Pinsite <invites@pinsite.pro>";
            const refCode = Math.random().toString(36).substring(2, 7).toUpperCase();
            const requestTime = new Date().toLocaleTimeString("en-US", {
              timeZone: "Asia/Kolkata",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const subject = `Reset your Pinsite password (${requestTime} IST) [Ref: #${refCode}]`;

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [normalizedEmail],
                subject,
                headers: {
                  "X-Entity-Ref-ID": refCode,
                },
                text: `Reset your Pinsite password:\n\nWe received a request to reset the password for your Pinsite workspace account.\n\nClick the link below to set a new password:\n${actionLink}\n\nThis link is valid for 1 hour.\nRequest ID: #${refCode} (${requestTime} IST)\nIf you didn't request this, you can safely ignore this email.`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; border: 1px solid #ECE8E1; border-radius: 20px; background-color: #FAF8F5;">
                    <div style="margin-bottom: 24px;">
                      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #F95721; font-family: monospace;">Pinsite Security</span>
                    </div>
                    <h2 style="color: #111110; margin-top: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Reset Your Password</h2>
                    <p style="color: #6E6B66; font-size: 14px; line-height: 1.6; margin: 12px 0 24px 0;">
                      We received a request to reset the password for your Pinsite workspace account. Click the button below to set a new password:
                    </p>
                    <div style="margin: 28px 0;">
                      <a href="${actionLink}" style="background-color: #F95721; color: #FFFFFF !important; padding: 14px 32px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(249, 87, 33, 0.3);">
                        Reset Password &rarr;
                      </a>
                    </div>
                    <div style="margin-top: 32px; border-top: 1px solid #ECE8E1; padding-top: 20px;">
                      <p style="color: #8A8680; font-size: 12px; line-height: 1.5; margin: 0 0 6px 0;">
                        This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
                      </p>
                      <p style="color: #B5B2AC; font-size: 11px; margin: 0;">
                        Ref: #${refCode} &bull; Generated at ${requestTime} IST
                      </p>
                    </div>
                  </div>
                `,
              }),
            });
          } catch (emailErr) {
            console.error("Resend email delivery failed:", emailErr);
          }
        }
      }
    }

    // Always return success message to prevent user enumeration
    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a reset link has been sent.",
    });
  } catch (err: any) {
    console.error("Forgot-password handler error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process password reset request" },
      { status: 500 }
    );
  }
}
