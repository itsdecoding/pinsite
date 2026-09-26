"use client";

import React, { useEffect, useState } from "react";
import {
  FolderKanban,
  CheckCircle,
  Clock,
  ExternalLink,
  Plus,
  AlertCircle,
  Calendar,
  Save,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EntityComments } from "@/components/comms/EntityComments";

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "review" | "blocked" | "done";
  due_date: string | null;
  hours_logged: number;
  completed_at: string | null;
  projects?: {
    client_name: string;
    staging_url: string | null;
    production_url: string | null;
  };
}

const COLUMNS: { id: Task["status"]; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "bg-slate-400" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { id: "review", label: "Review", color: "bg-amber-500" },
  { id: "blocked", label: "Blocked", color: "bg-red-500" },
  { id: "done", label: "Done", color: "bg-emerald-500" },
];

export default function ProjectsKanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const [hoursToAdd, setHoursToAdd] = useState("");
  const [isLoggingTime, setIsLoggingTime] = useState(false);

  const [stagingUrl, setStagingUrl] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [isSavingUrls, setIsSavingUrls] = useState(false);

  const supabase = createClient();

  async function loadTasks() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
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
        .is("deleted_at", null);

      if (error) throw error;
      if (data && data.length > 0) {
        setTasks(data as any);
      } else {
        // Fallback sample tasks
        setTasks([
          {
            id: "task-1",
            project_id: "p-1",
            title: "Configure Tailwind design tokens & font stack",
            description: "Deploy Simpliscale light/dark mode tokens",
            status: "done",
            due_date: "2026-09-28T18:00:00Z",
            hours_logged: 3.5,
            completed_at: "2026-09-26T12:00:00Z",
            projects: {
              client_name: "Simpliscale",
              staging_url: "https://staging.agency-os.vercel.app",
              production_url: "https://agency-os.vercel.app",
            },
          },
          {
            id: "task-2",
            project_id: "p-1",
            title: "Build Floating Island Sidebar",
            description: "Implement 24px rounded island sidebar with solid orange active pill",
            status: "in_progress",
            due_date: "2026-09-29T18:00:00Z",
            hours_logged: 2.0,
            completed_at: null,
            projects: {
              client_name: "Simpliscale",
              staging_url: "https://staging.agency-os.vercel.app",
              production_url: null,
            },
          },
          {
            id: "task-3",
            project_id: "p-2",
            title: "Supabase Realtime Channel & DM mesh",
            description: "Deploy unread tracking and member mention picker",
            status: "todo",
            due_date: "2026-09-30T18:00:00Z",
            hours_logged: 0,
            completed_at: null,
            projects: {
              client_name: "Luxe Hospitality",
              staging_url: null,
              production_url: null,
            },
          },
        ]);
      }
    } catch (err: any) {
      console.warn("Error loading tasks:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function handleStatusChange(taskId: string, newStatus: Task["status"]) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      await supabase.rpc("dev_update_task", {
        p_task_id: taskId,
        p_status: newStatus,
        p_hours_delta: 0,
        p_description: null,
      });
    } catch (err: any) {
      console.warn("Status update fallback:", err);
    }
  }

  async function handleLogTime(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !hoursToAdd) return;

    setIsLoggingTime(true);
    try {
      const delta = parseFloat(hoursToAdd);
      await supabase.rpc("dev_update_task", {
        p_task_id: activeTask.id,
        p_status: activeTask.status,
        p_hours_delta: delta,
        p_description: activeTask.description,
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeTask.id ? { ...t, hours_logged: Number(t.hours_logged) + delta } : t
        )
      );

      setActiveTask((prev) =>
        prev ? { ...prev, hours_logged: Number(prev.hours_logged) + delta } : null
      );
      setHoursToAdd("");
    } catch (err: any) {
      alert(`Failed to log time: ${err.message}`);
    } finally {
      setIsLoggingTime(false);
    }
  }

  async function handleSaveDeliverables(projectId: string) {
    setIsSavingUrls(true);
    try {
      await supabase
        .from("projects")
        .update({
          staging_url: stagingUrl.trim() || null,
          production_url: productionUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      setTasks((prev) =>
        prev.map((t) =>
          t.project_id === projectId
            ? {
                ...t,
                projects: {
                  client_name: t.projects?.client_name || "Client",
                  staging_url: stagingUrl.trim() || null,
                  production_url: productionUrl.trim() || null,
                },
              }
            : t
        )
      );
      alert("Deployment links updated successfully!");
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setIsSavingUrls(false);
    }
  }

  function openTaskDetail(task: Task) {
    setActiveTask(task);
    setStagingUrl(task.projects?.staging_url || "");
    setProductionUrl(task.projects?.production_url || "");
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Sprint Board...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            DEVELOPMENT KANBAN
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            Engineered for velocity.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
            Task execution board for 5 dedicated web developers.
          </p>
        </div>
      </div>

      {/* 5-Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-6">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-4 flex flex-col min-w-[240px] max-h-[750px] shadow-sm"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924] mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono">
                    {col.label}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-[#6E6B66] dark:text-[#8A8680]">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {colTasks.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-[#6E6B66] dark:text-[#8A8680] border border-dashed border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl">
                    Empty column
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => openTaskDetail(task)}
                      className="bg-black/5 dark:bg-white/5 hover:border-[#F95721]/50 border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-semibold truncate">
                          {task.projects?.client_name || "Deliverable"}
                        </span>
                        <span className="text-[10px] font-mono text-[#6E6B66] dark:text-[#8A8680] flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3 text-[#F95721]" />
                          {task.hours_logged || 0}h
                        </span>
                      </div>

                      <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] leading-snug group-hover:text-[#F95721] transition-colors">
                        {task.title}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-mono text-[#6E6B66] dark:text-[#8A8680] flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {task.due_date ? new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" }) : "No date"}
                        </span>

                        <select
                          value={task.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusChange(task.id, e.target.value as Task["status"])}
                          className="text-[10px] bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-full px-2 py-0.5 text-[#111110] dark:text-[#F5F3EF] outline-none"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="review">Review</option>
                          <option value="blocked">Blocked</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail & Time Logging Drawer */}
      {activeTask && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1A17] border-l border-[#ECE8E1] dark:border-[#2D2924] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-6 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  {activeTask.projects?.client_name || "Deliverable"}
                </span>
                <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF] mt-0.5">
                  {activeTask.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveTask(null)}
                className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Deliverable URLs */}
              <div className="p-5 rounded-3xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-[#F95721]" />
                  Deployment URLs
                </span>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[#6E6B66] dark:text-[#8A8680] mb-1">
                      Staging URL (Vercel Preview)
                    </label>
                    <input
                      type="url"
                      value={stagingUrl}
                      onChange={(e) => setStagingUrl(e.target.value)}
                      placeholder="https://staging.client.com"
                      className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#6E6B66] dark:text-[#8A8680] mb-1">
                      Production URL (Live Site)
                    </label>
                    <input
                      type="url"
                      value={productionUrl}
                      onChange={(e) => setProductionUrl(e.target.value)}
                      placeholder="https://client.com"
                      className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveDeliverables(activeTask.project_id)}
                    disabled={isSavingUrls}
                    className="w-full py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isSavingUrls ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Deployment URLs</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Time Logging */}
              <div className="p-5 rounded-3xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                    Log Work Hours
                  </span>
                  <span className="text-xs font-mono font-bold text-[#F95721]">
                    Logged: {activeTask.hours_logged}h
                  </span>
                </div>

                <form onSubmit={handleLogTime} className="flex gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    required
                    value={hoursToAdd}
                    onChange={(e) => setHoursToAdd(e.target.value)}
                    placeholder="Hours (e.g. 2.5)"
                    className="w-32 text-xs px-3.5 py-2.5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoggingTime || !hoursToAdd}
                    className="flex-1 py-2.5 px-4 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721] text-[#111110] dark:text-[#F5F3EF] font-semibold text-xs rounded-full transition-all disabled:opacity-50"
                  >
                    {isLoggingTime ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Log Hours"}
                  </button>
                </form>
              </div>

              {/* Comments Thread */}
              <EntityComments entityType="task" entityId={activeTask.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
