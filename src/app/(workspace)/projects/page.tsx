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
  Filter,
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
  { id: "todo", label: "To Do", color: "border-text-muted/40" },
  { id: "in_progress", label: "In Progress", color: "border-feedback-info/60" },
  { id: "review", label: "Review", color: "border-feedback-warning/60" },
  { id: "blocked", label: "Blocked", color: "border-feedback-error/60" },
  { id: "done", label: "Done", color: "border-feedback-success/60" },
];

export default function ProjectsKanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Time logging state
  const [hoursToAdd, setHoursToAdd] = useState("");
  const [timeComment, setTimeComment] = useState("");
  const [isLoggingTime, setIsLoggingTime] = useState(false);

  // Deliverables state
  const [stagingUrl, setStagingUrl] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [isSavingUrls, setIsSavingUrls] = useState(false);

  const supabase = createClient();

  async function loadTasks() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let query = supabase
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

      const { data, error } = await query;
      if (error) throw error;
      if (data) setTasks(data as any);
    } catch (err: any) {
      console.error("Failed to load tasks:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  // Update status using RPC dev_update_task
  async function handleStatusChange(taskId: string, newStatus: Task["status"]) {
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      const { error } = await supabase.rpc("dev_update_task", {
        p_task_id: taskId,
        p_status: newStatus,
        p_hours_delta: 0,
        p_description: null,
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
      loadTasks();
    }
  }

  // Quick Time Logging Drawer action
  async function handleLogTime(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !hoursToAdd) return;

    setIsLoggingTime(true);
    try {
      const delta = parseFloat(hoursToAdd);
      const { error } = await supabase.rpc("dev_update_task", {
        p_task_id: activeTask.id,
        p_status: activeTask.status,
        p_hours_delta: delta,
        p_description: activeTask.description,
      });

      if (error) throw error;

      // Update local state
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeTask.id
            ? { ...t, hours_logged: Number(t.hours_logged) + delta }
            : t
        )
      );

      setActiveTask((prev) =>
        prev ? { ...prev, hours_logged: Number(prev.hours_logged) + delta } : null
      );
      setHoursToAdd("");
      setTimeComment("");
    } catch (err: any) {
      alert(`Failed to log time: ${err.message}`);
    } finally {
      setIsLoggingTime(false);
    }
  }

  // Save Deliverable URLs on Project
  async function handleSaveDeliverables(projectId: string) {
    setIsSavingUrls(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          staging_url: stagingUrl.trim() || null,
          production_url: productionUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (error) throw error;

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
      alert("Deliverable URLs updated successfully!");
    } catch (err: any) {
      alert(`Failed to save deliverables: ${err.message}`);
    } finally {
      setIsSavingUrls(false);
    }
  }

  function openTaskDetail(task: Task) {
    setActiveTask(task);
    setStagingUrl(task.projects?.staging_url || "");
    setProductionUrl(task.projects?.production_url || "");
  }

  const isDueSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Kanban Sprint Board...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            Web Agency Engineering Kanban
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Task execution board for 5 dedicated web developers
          </p>
        </div>
      </div>

      {/* 5-Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              className="bg-background-surface border border-border-subtle rounded-xl p-3 flex flex-col min-w-[240px] max-h-[750px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full border-2 ${col.color}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-primary font-mono">
                    {col.label}
                  </span>
                </div>
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-background-elevated text-text-secondary">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {colTasks.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-text-muted border border-dashed border-border-subtle rounded-lg">
                    No tasks
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const dueSoon = isDueSoon(task.due_date);

                    return (
                      <div
                        key={task.id}
                        onClick={() => openTaskDetail(task)}
                        className="bg-background-card hover:bg-background-elevated border border-border-subtle hover:border-accent-border/50 rounded-lg p-3.5 shadow-card transition-all cursor-pointer space-y-2.5 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-accent-primary truncate">
                            {task.projects?.client_name || "Project"}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 text-text-muted" />
                            {task.hours_logged || 0}h
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-text-primary leading-snug group-hover:text-accent-primary transition-colors">
                          {task.title}
                        </p>

                        <div className="flex items-center justify-between pt-1">
                          {task.due_date ? (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                dueSoon
                                  ? "bg-feedback-error/10 text-feedback-error border border-feedback-error/30"
                                  : "bg-background-elevated text-text-secondary"
                              }`}
                            >
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(task.due_date).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-muted">No deadline</span>
                          )}

                          {/* Quick Advance Button */}
                          <select
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              handleStatusChange(task.id, e.target.value as Task["status"])
                            }
                            className="text-[10px] bg-background-input border border-border-subtle rounded px-1.5 py-0.5 text-text-secondary outline-none"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">Review</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail & Time Logging Drawer */}
      {activeTask && (
        <div className="fixed inset-0 z-[200] bg-background-base/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-background-surface border-l border-border-subtle h-full flex flex-col shadow-modal animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-border-subtle bg-background-elevated/40 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent-primary">
                  {activeTask.projects?.client_name || "Project Deliverable"}
                </span>
                <h3 className="text-base font-bold text-text-primary mt-0.5">
                  {activeTask.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveTask(null)}
                className="text-text-muted hover:text-text-primary text-xs px-2 py-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Deliverables Component (Staging URL & Production URL) */}
              <div className="p-4 rounded-xl bg-background-card border border-border-subtle space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-text-primary font-mono flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-accent-primary" />
                  Deliverable Deployment Links
                </span>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-text-secondary mb-1">
                      Staging URL (Vercel Preview / Netlify)
                    </label>
                    <input
                      type="url"
                      value={stagingUrl}
                      onChange={(e) => setStagingUrl(e.target.value)}
                      placeholder="https://staging.client.com"
                      className="w-full text-xs px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-text-primary placeholder:text-text-placeholder outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-text-secondary mb-1">
                      Production URL (Live Custom Domain)
                    </label>
                    <input
                      type="url"
                      value={productionUrl}
                      onChange={(e) => setProductionUrl(e.target.value)}
                      placeholder="https://www.client.com"
                      className="w-full text-xs px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-text-primary placeholder:text-text-placeholder outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveDeliverables(activeTask.project_id)}
                    disabled={isSavingUrls}
                    className="w-full py-2 bg-background-elevated hover:bg-background-surface border border-border-subtle rounded-md text-xs font-semibold text-text-primary flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isSavingUrls ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 text-accent-primary" />
                        <span>Save Deployment URLs</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Time Logging Drawer */}
              <div className="p-4 rounded-xl bg-background-card border border-border-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-primary font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-accent-primary" />
                    Time Log
                  </span>
                  <span className="text-xs font-mono font-bold text-accent-primary">
                    Total: {activeTask.hours_logged} hrs
                  </span>
                </div>

                <form onSubmit={handleLogTime} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      required
                      value={hoursToAdd}
                      onChange={(e) => setHoursToAdd(e.target.value)}
                      placeholder="Hours (e.g. 2.5)"
                      className="w-36 text-xs px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-text-primary placeholder:text-text-placeholder outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isLoggingTime || !hoursToAdd}
                      className="flex-1 py-2 px-3 bg-accent-primary hover:bg-accent-hover text-background-base font-semibold text-xs rounded-md flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isLoggingTime ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>Log Hours</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Embedded Comments Thread */}
              <EntityComments entityType="task" entityId={activeTask.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
