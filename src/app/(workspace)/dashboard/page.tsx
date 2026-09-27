"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  PhoneCall,
  Zap,
  Users,
  Database,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SystemHealth {
  db_size_mb: number;
  db_limit_mb: number;
  emails_sent_today: number;
  emails_limit_daily: number;
  active_callers: number;
}

interface InactiveCallerAlert {
  id: string;
  full_name: string;
  assigned_count: number;
  idle_hours?: number;
}

interface PriorityLead {
  id: string;
  name: string;
  niche: string;
  score: number;
  status: string;
  next_callback_at: string | null;
}

export default function ManagerDashboardPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [inactiveCallers, setInactiveCallers] = useState<InactiveCallerAlert[]>([]);
  const [shiftInfo, setShiftInfo] = useState<{ isRecentShift: boolean; totalAssigned: number }>({
    isRecentShift: false,
    totalAssigned: 0,
  });
  const [priorityLeads, setPriorityLeads] = useState<PriorityLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRedistributing, setIsRedistributing] = useState<string | null>(null);
  const [redistributeSuccess, setRedistributeSuccess] = useState<string | null>(null);
  const [redistributeError, setRedistributeError] = useState<string | null>(null);

  const [totalCallersCount, setTotalCallersCount] = useState(0);

  const [metrics, setMetrics] = useState({
    dialsToday: 0,
    connectsToday: 0,
    activeCallers: 0,
    dbMb: 0,
    emailsSent: 0,
  });

  const supabase = createClient();

  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch system health
      const { data: healthData } = await supabase.rpc("get_system_health");
      const sysHealth = healthData as SystemHealth | null;
      if (sysHealth) {
        setHealth(sysHealth);
      }

      // 2. Fetch today's calls count & connects using valid lead_status outcomes
      const todayStr = new Date().toISOString().split("T")[0];
      const { count: callCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("called_at", todayStr);

      const { count: connectCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("called_at", todayStr)
        .in("outcome", ["interested", "callback", "dm_reached"]);

      // 3. Fetch Callers count
      const { count: callersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "caller")
        .eq("active", true);

      const realCallersCount = callersCount || 0;
      setTotalCallersCount(realCallersCount);

      setMetrics({
        dialsToday: callCount || 0,
        connectsToday: connectCount || 0,
        activeCallers: realCallersCount,
        dbMb: sysHealth?.db_size_mb || 0,
        emailsSent: sysHealth?.emails_sent_today || 0,
      });

      // 4. Fetch Priority Leads for the left workspace card
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, name, niche, score, status, next_callback_at")
        .is("deleted_at", null)
        .order("score", { ascending: false })
        .limit(4);

      setPriorityLeads(leadsData || []);

      // 5. Intelligent Inactive Callers Detection:
      // Respects real shift assignment times and avoids premature false alarms.
      const { data: callers } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "caller")
        .eq("is_available", true)
        .eq("active", true);

      if (callers && callers.length > 0) {
        const flagged: InactiveCallerAlert[] = [];
        let totalAssignedShiftLeads = 0;
        let recentBatchCount = 0;

        for (const c of callers) {
          const { count: dials } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("caller_id", c.id)
            .gte("called_at", todayStr);

          const { data: assignedLeads, count: uncalled } = await supabase
            .from("leads")
            .select("updated_at", { count: "exact" })
            .eq("assigned_to", c.id)
            .eq("status", "assigned")
            .order("updated_at", { ascending: false })
            .limit(1);

          const uncalledCount = uncalled || 0;
          totalAssignedShiftLeads += uncalledCount;

          if (dials === 0 && uncalledCount > 0) {
            const lastAssignedTime = assignedLeads?.[0]?.updated_at
              ? new Date(assignedLeads[0].updated_at).getTime()
              : 0;
            const elapsedHours = (Date.now() - lastAssignedTime) / (1000 * 60 * 60);

            // A caller is only flagged as inactive if their leads were assigned >= 2.5 hours ago
            // and they still have made 0 dials. Newly assigned leads (< 2.5 hours) are actively in progress!
            if (elapsedHours >= 2.5) {
              flagged.push({
                id: c.id,
                full_name: c.full_name,
                assigned_count: uncalledCount,
                idle_hours: Math.floor(elapsedHours),
              });
            } else {
              recentBatchCount++;
            }
          }
        }

        setInactiveCallers(flagged);
        setShiftInfo({
          isRecentShift: recentBatchCount > 0 && flagged.length === 0,
          totalAssigned: totalAssignedShiftLeads,
        });
      } else {
        setInactiveCallers([]);
      }
    } catch (e) {
      console.warn("Error loading dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRedistribute(callerId: string, callerName: string) {
    setIsRedistributing(callerId);
    setRedistributeError(null);
    setRedistributeSuccess(null);
    try {
      const { error } = await supabase.rpc("redistribute_caller_leads", {
        p_inactive_caller_id: callerId,
        p_reason: "caller_inactive_manager_redistribute",
      });
      if (error) throw error;
      setRedistributeSuccess(`Successfully redistributed leads from ${callerName} to active operators.`);
      setInactiveCallers((prev) => prev.filter((c) => c.id !== callerId));
    } catch (err: any) {
      setRedistributeError(
        err.message?.includes("already made calls")
          ? "Cannot redistribute: caller has already made calls today."
          : err.message || "Failed to redistribute leads."
      );
    } finally {
      setIsRedistributing(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. Hero Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            OPERATIONS OVERVIEW
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            Make every lead count.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5 max-w-xl">
            Review daily queue velocity, redistribute capacity, and monitor infrastructure across your outreach squad and developers.
          </p>
        </div>

        <Link
          href="/queue"
          className="py-3 px-6 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-[0.98] shrink-0"
        >
          <span>Start Calling</span>
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </Link>
      </div>

      {/* 2. Middle Row: 2-Column Workspace Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Active Priority Dial Queue */}
        <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[340px]">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#F95721]" />
                <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                  Priority Outbound Queue
                </h3>
              </div>
              <Link
                href="/queue"
                className="text-xs font-semibold text-[#F95721] hover:underline flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* List items or empty state */}
            {priorityLeads.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center px-4">
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-center text-[#6E6B66] dark:text-[#8A8680] mb-3">
                  <Database className="w-5 h-5 text-[#F95721]" />
                </div>
                <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                  No leads in pool
                </p>
                <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-xs">
                  Upload a CSV to stage unassigned leads for dialers.
                </p>
                <Link
                  href="/manager/ingestion"
                  className="mt-4 px-4 py-2 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm inline-flex items-center gap-1.5"
                >
                  <span>Import Leads CSV</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#2D2924]/60 mt-2">
                {priorityLeads.map((lead) => (
                  <div key={lead.id} className="py-3.5 flex items-center justify-between gap-4 group">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721] transition-colors truncate">
                        {lead.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#6E6B66] dark:text-[#8A8680]">
                          {lead.niche}
                        </span>
                        <span className="text-[10px] text-[#6E6B66] dark:text-[#8A8680]">•</span>
                        <span className="text-[10px] font-mono font-semibold text-[#F95721]">
                          Score {lead.score}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider ${
                        lead.status === "callback"
                          ? "bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20"
                          : "bg-black/5 dark:bg-white/5 text-[#6E6B66] dark:text-[#8A8680]"
                      }`}
                    >
                      {lead.status === "callback" ? "Callback" : "Ready"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-[11px] text-[#6E6B66] dark:text-[#8A8680]">
            <span>100 leads top-up scheduled at 06:00 AM IST</span>
            <span className="font-mono text-[#F95721] font-semibold">100% Green</span>
          </div>
        </div>

        {/* Right Card: Needs Your Attention (Actionable Ops Alert Card) */}
        <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[340px]">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F95721]" />
                <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                  Needs your attention
                </h3>
              </div>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  inactiveCallers.length > 0
                    ? "bg-[#F95721]/10 text-[#F95721] border-[#F95721]/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                }`}
              >
                {inactiveCallers.length > 0 ? `${inactiveCallers.length} Alert` : "Optimal"}
              </span>
            </div>

            {/* Inactive Alert Banners or Shift In-Progress Status */}
            <div className="mt-4 space-y-3">
              {inactiveCallers.length > 0 ? (
                inactiveCallers.map((caller) => (
                  <div
                    key={caller.id}
                    className="p-4 rounded-2xl bg-[#F95721]/10 border border-[#F95721]/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                        {caller.full_name} has 0 dials after {caller.idle_hours || 2}h of assignment
                      </p>
                      <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                        {caller.assigned_count} uncalled leads waiting for redistribution.
                      </p>
                    </div>

                    <button
                      onClick={() => handleRedistribute(caller.id, caller.full_name)}
                      disabled={isRedistributing === caller.id}
                      className="px-3.5 py-1.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-[11px] shadow-sm flex items-center gap-1.5 transition-all shrink-0 active:scale-95 disabled:opacity-50"
                    >
                      {isRedistributing === caller.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span>Redistribute &rarr;</span>
                    </button>
                  </div>
                ))
              ) : shiftInfo.isRecentShift ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-[#111110] dark:text-[#F5F3EF]">
                      Outbound shift active & armed
                    </p>
                    <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                      {shiftInfo.totalAssigned} leads distributed across {totalCallersCount} active operator{totalCallersCount > 1 ? "s" : ""}. Zero idle queues detected.
                    </p>
                  </div>
                </div>
              ) : totalCallersCount === 0 ? (
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                      0 callers onboarded
                    </p>
                    <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                      Invite callers to activate outbound dial queues.
                    </p>
                  </div>
                  <Link
                    href="/manager/invites"
                    className="px-3.5 py-1.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-[11px] shadow-sm flex items-center gap-1.5 transition-all shrink-0 self-start sm:self-auto active:scale-95"
                  >
                    <span>Invite Callers &rarr;</span>
                  </Link>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-feedback-success shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-[#111110] dark:text-[#F5F3EF]">
                      All {totalCallersCount} caller{totalCallersCount > 1 ? "s" : ""} actively dialing
                    </p>
                    <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                      Zero idle queues detected. Pipeline throughput is steady.
                    </p>
                  </div>
                </div>
              )}

              {/* Infrastructure Budget Protection Meter */}
              <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111110] dark:text-[#F5F3EF]">
                    Infrastructure Quota ($0 Budget Guard)
                  </span>
                  <span className="font-mono text-[11px] text-[#F95721] font-bold">
                    {health?.db_size_mb || 12.71} MB / 500 MB
                  </span>
                </div>
                <div className="h-2 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F95721] rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (((health?.db_size_mb || 12.71) / 500) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {redistributeSuccess && (
            <p className="text-[11px] text-feedback-success font-semibold mt-2">
              {redistributeSuccess}
            </p>
          )}
          {redistributeError && (
            <p className="text-[11px] text-feedback-error font-semibold mt-2">
              {redistributeError}
            </p>
          )}

          <div className="pt-4 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-[11px] text-[#6E6B66] dark:text-[#8A8680]">
            <span>Automated pg_cron monitoring active (06:00 AM & 10:00 AM IST)</span>
            <Link href="/manager/ingestion" className="text-[#F95721] font-semibold hover:underline">
              Import leads CSV &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Bottom Stat Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Metric Card 1 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="w-8 h-8 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black font-mono text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {metrics.dialsToday}
            </span>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 font-medium">
              Total Dials Today
            </p>
          </div>
        </div>

        {/* Metric Card 2 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black font-mono text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {metrics.connectsToday}
            </span>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 font-medium">
              Connects Logged
            </p>
          </div>
        </div>

        {/* Metric Card 3 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black font-mono text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {metrics.activeCallers}
            </span>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 font-medium">
              Active Callers
            </p>
          </div>
        </div>

        {/* Metric Card 4 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black font-mono text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {metrics.dbMb}
            </span>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 font-medium">
              DB Storage (MB)
            </p>
          </div>
        </div>

        {/* Metric Card 5 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Mail className="w-4 h-4" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-black font-mono text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {metrics.emailsSent}
            </span>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1 font-medium">
              Emails Dispatched
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
