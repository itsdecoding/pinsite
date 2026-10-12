import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyApiSession } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyApiSession(req, {
      requiredRoles: ["admin", "manager", "developer"],
    });
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    const admin = getAdminClient();

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

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await verifyApiSession(req, {
      requiredRoles: ["admin", "manager", "developer"],
    });
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const admin = getAdminClient();

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const { error } = await admin
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Task deletion error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete task" }, { status: 500 });
  }
}

