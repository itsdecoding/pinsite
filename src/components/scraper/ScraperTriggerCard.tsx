"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  Radio,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ChevronDown,
  Layers,
} from "lucide-react";

interface ScraperStatus {
  id: string;
  is_online: boolean;
  last_heartbeat: string;
  current_area: string | null;
  current_batch: number;
  total_batches: number;
  leads_collected: number;
  target_leads: number;
  ip_address: string | null;
  active_job_id: string | null;
}

interface ScraperJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  broad_area: string;
  niche: string;
  target_leads: number;
  current_batch: number;
  total_batches: number;
  current_area: string | null;
  leads_collected: number;
  current_sublocations?: string[];
  error_message?: string;
  created_at: string;
}

const AVAILABLE_AREAS = ["Hadapsar", "Kothrud", "Baner", "Aundh", "Wakad", "Pimpri"];

export function ScraperTriggerCard({
  totalLeads = 0,
  onLeadsUpdated,
}: {
  totalLeads?: number;
  onLeadsUpdated?: () => void;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [activeJob, setActiveJob] = useState<ScraperJob | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("Hadapsar");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());

  // 1. Fetch live status & latest job
  const fetchTelemetry = useCallback(async () => {
    try {
      // Scraper heartbeat status
      const { data: statusRow } = await supabase
        .from("scraper_status")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (statusRow) {
        setStatus(statusRow as ScraperStatus);
      }

      // Latest job (either running/pending, or most recent)
      const { data: jobRow } = await supabase
        .from("scraper_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jobRow) {
        setActiveJob(jobRow as ScraperJob);
      }
      setLastRefreshedAt(Date.now());
    } catch (err) {
      console.warn("Error fetching scraper telemetry:", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 4000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel("scraper-live-telemetry")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scraper_status" },
        (payload) => {
          if (payload.new) setStatus(payload.new as ScraperStatus);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scraper_jobs" },
        (payload) => {
          if (payload.new) setActiveJob(payload.new as ScraperJob);
          if (onLeadsUpdated) onLeadsUpdated();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, onLeadsUpdated]);

  // Decision 3: Compute Heartbeat Health
  let health: "green" | "yellow" | "red" = "red";
  let healthLabel = "Scraper Offline — start daemon on laptop";

  if (status?.last_heartbeat) {
    const ageSeconds = Math.round((Date.now() - new Date(status.last_heartbeat).getTime()) / 1000);
    if (ageSeconds < 60) {
      health = "green";
      healthLabel = "Scraper Online";
    } else if (ageSeconds <= 600) {
      health = "yellow";
      healthLabel = `Scraper Stale (${Math.round(ageSeconds / 60)}m ago)`;
    } else {
      health = "red";
      healthLabel = "Scraper Offline — start daemon on laptop";
    }
  }

  // Check if job is currently active
  const isJobActive = activeJob?.status === "pending" || activeJob?.status === "running";

  // Trigger new scraping run
  const handleTriggerScrape = async () => {
    if (isJobActive || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("scraper_jobs")
        .insert({
          status: "pending",
          broad_area: selectedArea,
          niche: "Dentist",
          target_leads: 1000,
          current_batch: 0,
          total_batches: 4,
          leads_collected: 0,
          current_area: selectedArea,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setActiveJob(data as ScraperJob);
    } catch (err: any) {
      alert(`Failed to queue scrape job: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-4">
      {/* Top Bar: Title + Heartbeat Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#ECE8E1]/80 dark:border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#F95721]/10 flex items-center justify-center text-[#F95721]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] flex items-center gap-1.5 uppercase font-mono tracking-wider">
              <span>Google Maps Lead Engine</span>
              <span className="text-[10px] text-[#8A8680] font-normal normal-case">v2.0</span>
            </h4>
          </div>
        </div>

        {/* Heartbeat Status Indicator (Decision 3: Green/Yellow/Red) */}
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border transition-all ${
              health === "green"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : health === "yellow"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                health === "green"
                  ? "bg-emerald-500 animate-pulse"
                  : health === "yellow"
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
            />
            <span>{healthLabel}</span>
          </div>
        </div>
      </div>

      {/* Main Scraper Dashboard Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
        {/* Left Column: Target Area & Niche Selector */}
        <div className="md:col-span-5 flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-mono text-[#8A8680] uppercase tracking-wider mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#F95721]" />
              Start Zone
            </label>
            <div className="relative">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                disabled={isJobActive}
                className="w-full appearance-none px-3 py-2 bg-black/[0.03] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-bold text-[#111110] dark:text-[#F5F3EF] outline-none cursor-pointer disabled:opacity-60 pr-8"
              >
                {AVAILABLE_AREAS.map((a) => (
                  <option key={a} value={a} className="bg-white dark:bg-[#181715]">
                    {a}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#8A8680] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-mono text-[#8A8680] uppercase tracking-wider mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#F95721]" />
              Auto-Expansion
            </label>
            <div className="px-3 py-2 bg-black/[0.03] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-mono text-[#8A8680] truncate">
              6 Pune Zones
            </div>
          </div>
        </div>

        {/* Center: Live Status & Telemetry Banner */}
        <div className="md:col-span-4 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-white/5 flex flex-col justify-center">
          {isJobActive ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#F95721] font-bold flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {activeJob?.status === "pending"
                    ? "Dispatching daemon..."
                    : `Scraping ${activeJob?.current_area || selectedArea}`}
                </span>
                <span className="text-[#8A8680] font-bold">
                  Batch {activeJob?.current_batch || 1}/{activeJob?.total_batches || 4}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#F95721] to-[#E04612] rounded-full transition-all duration-500 animate-pulse"
                  style={{
                    width: `${Math.min(100, Math.max(15, Math.round(((activeJob?.leads_collected || 0) / (activeJob?.target_leads || 1000)) * 100)))}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-[#8A8680]">
                <span>{activeJob?.leads_collected || 0} leads gathered</span>
                <span>Target: {activeJob?.target_leads || 1000}</span>
              </div>
            </div>
          ) : activeJob?.status === "completed" ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight truncate">
                  Latest Run Done ({activeJob.leads_collected} leads)
                </p>
                <p className="text-[10px] text-[#8A8680] font-mono truncate">
                  Auto-assigned to callers &bull; Pool: {totalLeads} total
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#8A8680]">
              <Radio className="w-4 h-4 shrink-0 text-[#F95721]" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#111110] dark:text-[#F5F3EF] truncate">
                  Ready to Refill Pool
                </p>
                <p className="text-[10px] font-mono truncate">
                  Auto-continues across Hadapsar &rarr; Pimpri
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: CTA Trigger Button */}
        <div className="md:col-span-3 flex justify-end">
          <button
            type="button"
            onClick={handleTriggerScrape}
            disabled={isJobActive || isSubmitting}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-full font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${
              isJobActive
                ? "bg-[#F95721]/15 text-[#F95721] border border-[#F95721]/30 cursor-not-allowed"
                : health === "red"
                ? "bg-[#111110] dark:bg-white text-white dark:text-[#111110] hover:bg-[#F95721] hover:text-white dark:hover:bg-[#F95721] dark:hover:text-white"
                : "bg-[#F95721] hover:bg-[#E04612] text-white shadow-[#F95721]/20 shadow-lg"
            }`}
          >
            {isJobActive ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Batch {activeJob?.current_batch || 1}/4 &bull; {activeJob?.leads_collected || 0}
                </span>
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Queueing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scrape Fresh Leads</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
