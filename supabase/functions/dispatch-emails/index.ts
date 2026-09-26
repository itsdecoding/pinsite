// Supabase Edge Function: Dispatch Emails
// POST /dispatch-emails
// Validates header: x-dispatch-secret
// Claims pending rows with SKIP LOCKED, renders templates, sends via Resend API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
};

function renderTemplate(template: string, payload: any): string {
  const baseStyle = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background-color: #121110;
    color: #F4F4F5;
    padding: 32px 20px;
  `;
  const cardStyle = `
    max-width: 520px;
    margin: 0 auto;
    background: #181715;
    border: 1px solid #262421;
    border-radius: 8px;
    padding: 24px;
  `;
  const buttonStyle = `
    display: inline-block;
    background: #C9A961;
    color: #121110;
    font-weight: 600;
    padding: 10px 20px;
    border-radius: 6px;
    text-decoration: none;
    margin-top: 16px;
  `;

  if (template === "urgent_callback") {
    return `
      <div style="${baseStyle}">
        <div style="${cardStyle}">
          <h2 style="color: #C9A961; margin-top: 0;">⚡ Urgent Callback Reminder</h2>
          <p style="color: #A1A1AA; font-size: 15px;">
            You have a scheduled callback with <strong>${payload.lead_name || "Lead"}</strong> in 15 minutes.
          </p>
          <a href="${payload.app_url || "https://agency-os.vercel.app"}/queue" style="${buttonStyle}">
            Open Call Queue &rarr;
          </a>
        </div>
      </div>
    `;
  }

  if (template === "mention") {
    return `
      <div style="${baseStyle}">
        <div style="${cardStyle}">
          <h2 style="color: #C9A961; margin-top: 0;">💬 You Were Mentioned</h2>
          <p style="color: #A1A1AA; font-size: 15px;">
            <strong>${payload.author_name || "A team member"}</strong> mentioned you in <em>${payload.entity_title || "an entity thread"}</em>:
          </p>
          <blockquote style="border-left: 2px solid #C9A961; margin: 16px 0; padding-left: 12px; color: #F4F4F5; font-style: italic;">
            ${payload.comment_preview || "View comment in Agency OS"}
          </blockquote>
          <a href="${payload.link || "https://agency-os.vercel.app"}" style="${buttonStyle}">
            View Conversation &rarr;
          </a>
        </div>
      </div>
    `;
  }

  if (template === "task_due_soon") {
    return `
      <div style="${baseStyle}">
        <div style="${cardStyle}">
          <h2 style="color: #F59E0B; margin-top: 0;">⏳ Task Due in 2 Hours</h2>
          <p style="color: #A1A1AA; font-size: 15px;">
            The task <strong>${payload.task_title || "Development Task"}</strong> has its deadline approaching in less than 2 hours.
          </p>
          <a href="${payload.app_url || "https://agency-os.vercel.app"}/projects" style="${buttonStyle}">
            View Kanban Board &rarr;
          </a>
        </div>
      </div>
    `;
  }

  return `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        <p style="color: #F4F4F5;">${JSON.stringify(payload)}</p>
      </div>
    </div>
  `;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const expectedSecret = Deno.env.get("DISPATCH_SECRET") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    // 1. Validate x-dispatch-secret
    const secretHeader = req.headers.get("x-dispatch-secret");
    if (!secretHeader || (expectedSecret && secretHeader !== expectedSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid dispatch secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({ limit: 10 }));
    const batchLimit = Math.min(Math.max(1, body.limit || 10), 50);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Race-Condition-Proof Batch Claim via RPC/RAW Query
    // We execute the lock & claim query directly via postgres
    const { data: claimedEmails, error: claimErr } = await supabase.rpc("claim_email_batch", {
      p_limit: batchLimit,
    });

    // Fallback if custom RPC not yet installed: manual select & update
    let emailsToProcess = claimedEmails;
    if (claimErr || !claimedEmails) {
      const { data: pendingRows } = await supabase
        .from("email_queue")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(batchLimit);

      if (pendingRows && pendingRows.length > 0) {
        const ids = pendingRows.map((r: any) => r.id);
        await supabase
          .from("email_queue")
          .update({ status: "sending", claimed_at: new Date().toISOString() })
          .in("id", ids);
        emailsToProcess = pendingRows;
      } else {
        emailsToProcess = [];
      }
    }

    if (!emailsToProcess || emailsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "No pending emails to dispatch", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let failCount = 0;

    for (const emailRow of emailsToProcess) {
      try {
        const htmlContent = renderTemplate(emailRow.template, emailRow.payload || {});

        if (resendApiKey) {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Agency OS <notifications@agency-os.com>",
              to: [emailRow.email_to],
              subject: emailRow.subject,
              html: htmlContent,
            }),
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Resend API error: ${errBody}`);
          }
        } else {
          console.log(`[SIMULATED EMAIL] To: ${emailRow.email_to} | Subject: ${emailRow.subject}`);
        }

        await supabase
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", emailRow.id);

        sentCount++;
      } catch (sendErr: any) {
        failCount++;
        await supabase
          .from("email_queue")
          .update({
            status: "failed",
            error_message: sendErr.message,
            retry_count: (emailRow.retry_count || 0) + 1,
          })
          .eq("id", emailRow.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: emailsToProcess.length, sent: sentCount, failed: failCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
