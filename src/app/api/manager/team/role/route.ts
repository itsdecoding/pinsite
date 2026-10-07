import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

const VALID_ROLES = ["caller", "manager", "developer", "admin"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const OWNER_EMAIL = "muzammilpathan6047@gmail.com";
const OWNER_PROFILE_ID = "a87c7c79-6c4c-4787-8132-8cff8f7a1e74";

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
    .select("role, full_name")
    .eq("id", activeUser.id)
    .maybeSingle();

  const role = profile?.role || "caller";
  if (role !== "admin" && role !== "manager") {
    return { error: "Forbidden: Manager or Admin role required", status: 403 };
  }

  return { user: activeUser, role, fullName: profile?.full_name || "Manager" };
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user: actingUser, role: actingRole } = authResult;
    const body = await req.json();
    const { userId, newRole } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
    }

    if (!newRole || !VALID_ROLES.includes(newRole as ValidRole)) {
      return NextResponse.json(
        { error: `Invalid role. Allowed roles are: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // 1. Safety Guard: Never allow modifying or demoting workspace owner
    if (userId === OWNER_PROFILE_ID) {
      return NextResponse.json(
        { error: "Forbidden: The Workspace Owner account role cannot be modified." },
        { status: 403 }
      );
    }

    const { data: targetAuthUser } = await admin.auth.admin.getUserById(userId);
    if (targetAuthUser?.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      return NextResponse.json(
        { error: "Forbidden: The Workspace Owner account role cannot be modified." },
        { status: 403 }
      );
    }

    // 2. Fetch current profile
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "Teammate profile not found" }, { status: 404 });
    }

    // 3. Permission checks:
    // Only Admin can promote to or demote from Admin.
    // Managers cannot promote someone to Admin.
    if (actingRole !== "admin") {
      if (newRole === "admin" || targetProfile.role === "admin") {
        return NextResponse.json(
          { error: "Forbidden: Only administrators can grant or revoke the Admin role." },
          { status: 403 }
        );
      }
    }

    // 4. Update profile in database
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update profile role:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 4b. Permanent Fix: When changing from caller -> non-caller, auto-reassign active leads to unassigned pool
    let reassignedCount = 0;
    if (targetProfile.role === "caller" && newRole !== "caller") {
      try {
        const { data: assignedLeads, error: leadsErr } = await admin
          .from("leads")
          .select("id")
          .eq("assigned_to", userId)
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc")');

        if (!leadsErr && assignedLeads && assignedLeads.length > 0) {
          const leadIds = assignedLeads.map((l) => l.id);
          const { error: unassignErr } = await admin
            .from("leads")
            .update({
              status: "unassigned",
              assigned_to: null,
              assigned_date: null,
              cooldown_until: null,
              next_callback_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("assigned_to", userId)
            .is("deleted_at", null)
            .not("status", "in", '("closed_won","closed_lost","dnc")');

          if (unassignErr) {
            console.error("Failed to unassign leads on role change:", unassignErr);
          } else {
            reassignedCount = leadIds.length;
            // Record in assignment history for audit
            const historyRows = leadIds.map((lid) => ({
              lead_id: lid,
              from_caller_id: userId,
              to_caller_id: null,
              assigned_by: actingUser.id,
              reason: `role_changed_to_${newRole}`,
              acted_by: actingUser.id,
              on_behalf_of: userId,
            }));
            await admin.from("assignment_history").insert(historyRows);
          }
        }
      } catch (leadReassignErr) {
        console.error("Error auto-reassigning leads during role change:", leadReassignErr);
      }
    }

    // 5. Sync metadata in auth.users
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: newRole,
        },
      });
    } catch (authMetaErr) {
      console.warn("Could not sync auth user_metadata (non-blocking):", authMetaErr);
    }

    // 6. Notify user of role change
    try {
      await admin.from("notifications").insert({
        user_id: userId,
        type: "role_updated",
        title: "Role Updated",
        body: `Your workspace role has been updated to ${newRole.toUpperCase()} by an administrator.`,
        entity_type: "lead",
        entity_id: userId,
        link: newRole === "caller" ? "/queue" : newRole === "developer" ? "/projects" : "/manager/team",
      });
    } catch {
      // Non-blocking notification
    }

    return NextResponse.json({
      success: true,
      userId,
      oldRole: targetProfile.role,
      newRole,
      reassignedCount,
      message: `Successfully changed ${targetProfile.full_name}'s role to ${newRole.toUpperCase()}.${
        reassignedCount > 0 ? ` Returned ${reassignedCount} leads to unassigned pool.` : ""
      }`,
    });
  } catch (err: any) {
    console.error("Error in role update endpoint:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error updating role" },
      { status: 500 }
    );
  }
}
