import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { title, client_name, description, status, due_date, dev_id } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }

    const clientName = client_name?.trim() || "General Project";

    // 1. Find or create project
    let projectId: string;
    const { data: existingProject } = await supabase
      .from("projects")
      .select("id")
      .ilike("client_name", clientName)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const { data: newProject, error: projectError } = await supabase
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

    // 2. Insert new task
    const taskStatus = status && ["todo", "in_progress", "review", "blocked", "done"].includes(status)
      ? status
      : "todo";

    const { data: newTask, error: taskError } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: title.trim(),
        description: description?.trim() || null,
        status: taskStatus,
        due_date: due_date || null,
        dev_id: dev_id || null,
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
