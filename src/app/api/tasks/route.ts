import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 1. Authenticate user
    const serverSupabase = createServerClient();
    let {
      data: { user },
    } = await serverSupabase.auth.getUser();

    const admin = createAdminClient(supabaseUrl, supabaseServiceKey);

    if (!user) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const { data: jwtData } = await admin.auth.getUser(token);
        user = jwtData.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role || "caller";
    if (role !== "admin" && role !== "manager" && role !== "developer") {
      return NextResponse.json(
        { error: "Forbidden: Only developers and managers can manage project tasks" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, client_name, description, status, due_date, dev_id } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }

    const clientName = client_name?.trim() || "General Project";

    // 2. Find or create project
    let projectId: string;
    const { data: existingProject } = await admin
      .from("projects")
      .select("id")
      .ilike("client_name", clientName)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const { data: newProject, error: projectError } = await admin
        .from("projects")
        .insert({
          client_name: clientName,
          status: "active",
        })
        .select("id")
        .single();

      if (projectError) throw projectError;
      projectId = newProject.id;
    }

    // 3. Insert new task
    const taskStatus =
      status && ["todo", "in_progress", "review", "blocked", "done"].includes(status)
        ? status
        : "todo";

    const { data: newTask, error: taskError } = await admin
      .from("tasks")
      .insert({
        project_id: projectId,
        title: title.trim(),
        description: description?.trim() || null,
        status: taskStatus,
        due_date: due_date || null,
        dev_id: dev_id || user.id,
      })
      .select(`
        id,
        project_id,
        title,
        description,
        status,
        due_date,
        hours_logged,
        completed_at,
        projects:project_id (
          client_name,
          staging_url,
          production_url
        )
      `)
      .single();

    if (taskError) throw taskError;

    return NextResponse.json({ task: newTask }, { status: 201 });
  } catch (err: any) {
    console.error("Task creation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create task" },
      { status: 500 }
    );
  }
}
