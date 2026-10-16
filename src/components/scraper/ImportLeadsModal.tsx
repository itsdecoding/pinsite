"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  MapPin,
  Tag,
  Copy,
  Check,
  Layers,
  ArrowRight,
  Play,
  RotateCw,
  Clock,
  ShieldCheck,
  Terminal,
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
  control_action?: string | null;
  run_state?: "idle" | "running" | "waiting_decision" | "completed";
  updated_at: string;
}

interface IngestionStats {
  total: number;
  processed: number;
  inserted: number;
  duplicates: number;
  invalid: number;
}

interface ParsedPreview {
  name: string;
  phone: string;
  website: string;
  address: string;
  niche: string;
  area: string;
}

const SUGGESTED_LOCATIONS = [
  "Hadapsar",
  "Kothrud",
  "Baner",
  "Aundh",
  "Wakad",
  "Viman Nagar",
  "Manhattan, New York",
  "Dubai, UAE",
  "London, UK",
  "Indiranagar, Bangalore",
  "Bandra, Mumbai",
];

export function openImportLeadsModal(defaultTab?: "csv" | "scrape") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-import-leads-modal", { detail: { tab: defaultTab } })
    );
  }
}

export function ImportLeadsModal() {
  const supabase = createClient();
  const { profile, user } = useUserSession();

  // Role detection: Admin only for scrape option
  const rawRole = (profile?.role || user?.user_metadata?.role || "admin").toLowerCase();
  const isAdmin = rawRole === "admin" || rawRole === "owner";

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"csv" | "scrape">("csv");

  // Scraper configuration state (Broad area + Manual sub-locations)
  const [broadArea, setBroadArea] = useState<string>("Hadapsar");
  const [subLocationsInput, setSubLocationsInput] = useState<string>("");
  const [moreSubLocations, setMoreSubLocations] = useState<string>("");
  const [targetLeads, setTargetLeads] = useState<number>(1000);
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);

  // CSV Ingestion state
  const [file, setFile] = useState<File | null>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvStats, setCsvStats] = useState<IngestionStats | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedPreview[]>([]);
  const [targetNiche, setTargetNiche] = useState("Dentist");
  const [targetArea, setTargetArea] = useState("Kothrud");
  const [targetScore, setTargetScore] = useState(75);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen to modal open events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsOpen(true);
      if (customEvent.detail?.tab === "scrape" && isAdmin) {
        setActiveTab("scrape");
      } else {
        setActiveTab("csv");
      }
    };

    window.addEventListener("open-import-leads-modal", handleOpen);
    return () => window.removeEventListener("open-import-leads-modal", handleOpen);
  }, [isAdmin]);

  // Fetch live scraper status & telemetry
  const fetchScraperTelemetry = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("scraper_status")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data) {
        setScraperStatus(data as ScraperStatus);
      }
    } catch (err) {
      console.warn("Failed to fetch scraper status:", err);
    }
  }, [supabase]);

  useEffect(() => {
    if (!isOpen) return;
    fetchScraperTelemetry();

    const interval = setInterval(fetchScraperTelemetry, 3000);

    // Supabase Realtime channel for instant telemetry updates
    const channel = supabase
      .channel("modal-scraper-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scraper_status" },
        (payload) => {
          if (payload.new) {
            setScraperStatus(payload.new as ScraperStatus);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isOpen, fetchScraperTelemetry, supabase]);

  // Connection status: Heartbeat < 60s
  const heartbeatAgeSec = scraperStatus?.last_heartbeat
    ? Math.max(0, Math.round((Date.now() - new Date(scraperStatus.last_heartbeat).getTime()) / 1000))
    : 999999;
  const isConnected = Boolean(scraperStatus?.is_online && heartbeatAgeSec < 60);

  // Background daemon startup command
  const daemonCommand = `cd C:\\Users\\Muzammil\\Desktop\\lead-finder; node orchestrator.js --daemon`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(daemonCommand);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2200);
  };

  // Trigger scrape execution via daemon (submits job to scraper_jobs)
  const handleStartScrape = async () => {
    const cleanArea = broadArea.trim();
    if (!cleanArea) {
      alert("Please enter a broad area (e.g. Hadapsar, Kothrud, Manhattan, Dubai).");
      return;
    }

    const subLocs = subLocationsInput
      .split("\n")
      .map((s) => s.replace(/^[\s•\-\*\d\.\)]+/, "").trim())
      .filter(Boolean);

    setIsActionLoading(true);
    try {
      // 1. Submit pending job to scraper_jobs for daemon pickup
      const totalBatches = Math.ceil(subLocs.length / 5) || 1;
      const { data: jobData, error: jobErr } = await supabase
        .from("scraper_jobs")
        .insert({
          status: "pending",
          broad_area: cleanArea,
          niche: "Dentist",
          target_leads: targetLeads,
          current_batch: 0,
          total_batches: totalBatches,
          leads_collected: 0,
          current_area: cleanArea,
          current_sublocations: subLocs,
        })
        .select()
        .single();

      if (jobErr) console.warn("Job insert notice:", jobErr.message);

      // 2. Update scraper_status state
      await supabase
        .from("scraper_status")
        .update({
          run_state: "running",
          current_area: cleanArea,
          target_leads: targetLeads,
          leads_collected: 0,
          current_batch: 0,
          total_batches: totalBatches,
          active_job_id: jobData?.id || null,
          control_action: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      await fetchScraperTelemetry();
    } catch (err: any) {
      alert(`Error submitting scrape job: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Progress loop decision handlers (Add 5 more | Skip for now | Cancel)
  const handleControlAction = async (action: "continue" | "skip" | "cancel") => {
    setIsActionLoading(true);
    try {
      const updates: Partial<ScraperStatus> = {
        control_action: action,
        updated_at: new Date().toISOString(),
      };

      if (action === "continue") {
        updates.run_state = "running";
      } else if (action === "skip") {
        updates.run_state = "completed";
      } else if (action === "cancel") {
        updates.run_state = "idle";
      }

      await supabase.from("scraper_status").update(updates).eq("id", "default");
      await fetchScraperTelemetry();
    } catch (err: any) {
      alert(`Control action failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle adding more sub-locations when sub-locations are exhausted
  const handleAddMoreLocations = async () => {
    const newLocs = moreSubLocations
      .split("\n")
      .map((s) => s.replace(/^[\s•\-\*\d\.\)]+/, "").trim())
      .filter(Boolean);

    if (newLocs.length === 0) return;

    setIsActionLoading(true);
    try {
      await supabase
        .from("scraper_status")
        .update({
          control_action: JSON.stringify({
            action: "add_locations",
            sublocations: newLocs,
          }),
          run_state: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      setMoreSubLocations("");
      await fetchScraperTelemetry();
    } catch (err: any) {
      alert(`Error adding locations: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Distribute leads equally across callers via /api/manager/leads/distribute
  const handleDistributeLeadsEqually = async () => {
    setIsActionLoading(true);
    setAssignSuccessMsg(null);
    try {
      const res = await fetch("/api/manager/leads/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "equal" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to distribute leads");
      setAssignSuccessMsg(
        `Successfully distributed ${data.assigned_count} leads equally across ${data.callers_breakdown?.length || 0} active callers!`
      );
    } catch (err: any) {
      alert(`Distribution warning: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // CSV Parsing & Ingestion Helpers
  function getVal(row: any, candidates: string[]): string {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      if (row[cand] !== undefined && row[cand] !== null && String(row[cand]).trim() !== "") {
        return String(row[cand]).trim();
      }
      const matchedKey = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (
        matchedKey &&
        row[matchedKey] !== undefined &&
        row[matchedKey] !== null &&
        String(row[matchedKey]).trim() !== ""
      ) {
        return String(row[matchedKey]).trim();
      }
    }
    return "";
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setCsvStats(null);
      setCsvError(null);

      // Extract sample rows
      Papa.parse(selected, {
        header: true,
        preview: 4,
        skipEmptyLines: true,
        complete: (results) => {
          const sample = (results.data as any[]).map((row) => ({
            name: getVal(row, ["Business Name", "name", "company", "title", "clinic name"]),
            phone: getVal(row, ["Phone Number", "phone", "mobile", "contact"]),
            website: getVal(row, ["Google Maps Link", "Website URL", "website", "url"]),
            address: getVal(row, ["Address", "Full Address", "location", "address"]),
            niche: getVal(row, ["niche", "category", "industry"]) || targetNiche,
            area: getVal(row, ["area", "city", "locality"]) || targetArea,
          }));
          setPreviewRows(sample);
        },
      });
    }
  };

  const processAndUploadCsv = async () => {
    if (!file) return;

    setIsProcessingCsv(true);
    setCsvProgress(0);
    setCsvError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (!rows || rows.length === 0) {
            throw new Error("No data rows found in uploaded CSV file.");
          }

          const totalRows = rows.length;
          const chunkSize = 500;
          let currentInserted = 0;
          let currentDuplicates = 0;
          let currentInvalid = 0;

          for (let i = 0; i < totalRows; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize).map((row) => {
              const name = getVal(row, ["Business Name", "name", "company", "title", "clinic name"]);
              const phone = getVal(row, ["Phone Number", "phone", "mobile", "contact"]);
              const website = getVal(row, ["Google Maps Link", "Website URL", "website", "url", "maps link"]);
              const address = getVal(row, ["Address", "Full Address", "location", "address"]);
              const niche = getVal(row, ["niche", "category", "industry"]) || targetNiche || "Dentist";
              const area = getVal(row, ["area", "city", "locality"]) || targetArea || "Kothrud";
              const scoreVal = parseInt(getVal(row, ["score", "lead score"]) || String(targetScore), 10);

              return {
                name,
                phone,
                website: website || null,
                address: address || null,
                niche,
                area,
                score: isNaN(scoreVal) ? targetScore : scoreVal,
              };
            });

            const res = await fetch("/api/leads/ingest", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-source": "csv_upload",
              },
              body: JSON.stringify(chunk),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Upload batch failed with status ${res.status}`);
            }

            const data = await res.json();
            if (data.summary) {
              currentInserted += data.summary.inserted;
              currentDuplicates += data.summary.skipped_duplicates;
              currentInvalid += data.summary.invalid;
            }

            const processedCount = Math.min(totalRows, i + chunkSize);
            setCsvProgress(Math.round((processedCount / totalRows) * 100));

            setCsvStats({
              total: totalRows,
              processed: processedCount,
              inserted: currentInserted,
              duplicates: currentDuplicates,
              invalid: currentInvalid,
            });
          }
        } catch (err: any) {
          setCsvError(err.message || "Failed to complete CSV ingestion.");
        } finally {
          setIsProcessingCsv(false);
        }
      },
      error: (err) => {
        setCsvError(`CSV Parse Error: ${err.message}`);
        setIsProcessingCsv(false);
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-[#FCFAF6] dark:bg-[#121313] border border-[#ECE8E1] dark:border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-[#ECE8E1] dark:border-white/10 flex items-center justify-between gap-3 bg-white/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F95721]/10 flex items-center justify-center text-[#F95721]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                Import Leads
              </h3>
              <p className="text-[11px] text-[#8A8680]">
                Bring leads into Agency OS via CSV upload or live Google Maps scrape
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#8A8680] hover:text-[#111110] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option Tabs (Upload CSV vs Scrape from Maps) */}
        {isAdmin ? (
          <div className="px-5 pt-3 border-b border-[#ECE8E1] dark:border-white/10 flex items-center gap-2 bg-black/[0.01] dark:bg-white/[0.01]">
            <button
              onClick={() => setActiveTab("csv")}
              className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === "csv"
                  ? "border-[#F95721] text-[#F95721]"
                  : "border-transparent text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload CSV</span>
            </button>

            <button
              onClick={() => setActiveTab("scrape")}
              className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === "scrape"
                  ? "border-[#F95721] text-[#F95721]"
                  : "border-transparent text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F95721]" />
              <span>Scrape from Maps</span>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] font-mono">
                Admin
              </span>
            </button>
          </div>
        ) : null}

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* ========================================================================= */}
          {/* TAB 1: UPLOAD CSV                                                         */}
          {/* ========================================================================= */}
          {activeTab === "csv" && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#ECE8E1] dark:border-white/10 hover:border-[#F95721] bg-white dark:bg-white/[0.02] rounded-2xl p-6 text-center cursor-pointer transition-all shadow-sm group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-2.5 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                  {file ? file.name : "Click to browse or drop CSV here"}
                </h4>
                <p className="text-[11px] text-[#8A8680] mt-0.5">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB • Ready for ingest`
                    : "Supports Google Maps exports, Justdial, and custom lead CSV files"}
                </p>
              </div>

              {/* Sample Table Preview */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase text-[#8A8680] font-bold">
                    Detected Sample Rows ({previewRows.length})
                  </div>
                  <div className="border border-[#ECE8E1] dark:border-white/10 rounded-xl overflow-x-auto text-[11px]">
                    <table className="w-full text-left">
                      <thead className="bg-black/[0.03] dark:bg-white/[0.04] text-[#8A8680] font-mono">
                        <tr>
                          <th className="py-1.5 px-3 font-semibold">Business</th>
                          <th className="py-1.5 px-3 font-semibold">Phone</th>
                          <th className="py-1.5 px-3 font-semibold">Area</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECE8E1] dark:divide-white/5">
                        {previewRows.map((r, i) => (
                          <tr key={i} className="text-[#111110] dark:text-[#F5F3EF]">
                            <td className="py-1.5 px-3 font-medium truncate max-w-[140px]">
                              {r.name || "—"}
                            </td>
                            <td className="py-1.5 px-3 font-mono">{r.phone || "—"}</td>
                            <td className="py-1.5 px-3 truncate max-w-[120px]">{r.area}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ingestion Parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-[#8A8680] uppercase mb-1">
                    Target Niche
                  </label>
                  <input
                    type="text"
                    value={targetNiche}
                    onChange={(e) => setTargetNiche(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-semibold outline-none text-[#111110] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-[#8A8680] uppercase mb-1">
                    Target Area
                  </label>
                  <input
                    type="text"
                    value={targetArea}
                    onChange={(e) => setTargetArea(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-semibold outline-none text-[#111110] dark:text-white"
                  />
                </div>
              </div>

              {/* Progress & Stats */}
              {isProcessingCsv && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-[#8A8680]">
                    <span>Uploading & Deduplicating...</span>
                    <span>{csvProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F95721] transition-all duration-300"
                      style={{ width: `${csvProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {csvStats && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Inserted <strong>{csvStats.inserted}</strong> leads into pipeline!
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#8A8680]">
                    {csvStats.duplicates} dupes skipped
                  </span>
                </div>
              )}

              {csvError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {/* Upload Action Button */}
              <button
                onClick={processAndUploadCsv}
                disabled={!file || isProcessingCsv}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#8E4128] to-[#D97755] text-white text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {isProcessingCsv ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Ingest...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Process & Ingest CSV</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: SCRAPE FROM MAPS (Admin Only)                                      */}
          {/* ========================================================================= */}
          {activeTab === "scrape" && isAdmin && (
            <div className="space-y-4">
              {/* Simplified Status Pill (● Scraper Connected vs ● Scraper Offline) */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  <span
                    className={`text-xs font-bold font-mono ${
                      isConnected
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {isConnected ? "● Scraper Connected" : "● Scraper Offline"}
                  </span>
                  {isConnected && (
                    <span className="text-[10px] text-[#8A8680] font-mono">
                      (Heartbeat {heartbeatAgeSec}s ago)
                    </span>
                  )}
                </div>

                <button
                  onClick={fetchScraperTelemetry}
                  className="text-xs text-[#8A8680] hover:text-[#111110] dark:hover:text-white flex items-center gap-1 font-mono transition-colors"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* STATE A: OFFLINE (Daemon Not Running)                             */}
              {/* ----------------------------------------------------------------- */}
              {!isConnected && (
                <div className="p-4 rounded-2xl bg-red-500/[0.04] border border-red-500/20 space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Start Background Daemon on your Laptop</span>
                    </h4>
                    <p className="text-[11px] text-[#8A8680] leading-relaxed">
                      The scraper runs as a lightweight background daemon on your laptop. Run this command
                      or double-click <strong>run-daemon.bat</strong> in your lead-finder folder:
                    </p>
                  </div>

                  {/* Terminal Copy-Paste Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#8A8680]">
                      <span>DAEMON COMMAND (RUN ONCE):</span>
                      {isCopied && <span className="text-emerald-500 font-bold">Copied to Clipboard!</span>}
                    </div>
                    <div className="relative flex items-center bg-[#0C0D0E] text-[#4ADE80] font-mono text-xs p-3 rounded-xl border border-white/10 overflow-x-auto shadow-inner">
                      <span className="select-all pr-12 truncate">{daemonCommand}</span>
                      <button
                        onClick={handleCopyCommand}
                        className="absolute right-2 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-[11px] font-bold flex items-center gap-1 transition-all"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{isCopied ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#8A8680] italic">
                    ℹ️ Once the daemon starts, this screen will automatically flip to &quot;● Scraper Connected&quot;
                    and allow you to scrape any city, neighborhood, or country in the world.
                  </p>
                </div>
              )}

              {/* ----------------------------------------------------------------- */}
              {/* STATE B: CONNECTED (Daemon Running: Free-text Location Scraper)     */}
              {/* ----------------------------------------------------------------- */}
              {isConnected && (
                <div className="space-y-4">
                  {/* Scenario 1: Scraping in Progress */}
                  {scraperStatus?.run_state === "running" && (
                    <div className="p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-white/10 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-[#F95721] animate-spin" />
                          <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            Scraping in Progress • {scraperStatus.current_area || broadArea}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-[#8A8680]">
                            Batch {scraperStatus.current_batch} of {scraperStatus.total_batches || 1}
                          </span>
                          <button
                            onClick={() => {
                              supabase
                                .from("scraper_status")
                                .update({ run_state: "idle", active_job_id: null })
                                .eq("id", "default")
                                .then(() => fetchScraperTelemetry());
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            Reset / New Scrape
                          </button>
                        </div>
                      </div>

                      {/* Live Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono font-bold text-[#111110] dark:text-white">
                          <span>Clean Leads Collected</span>
                          <span>
                            {scraperStatus.leads_collected} / {scraperStatus.target_leads || targetLeads}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#F95721] to-[#E04816] transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (scraperStatus.leads_collected /
                                    (scraperStatus.target_leads || targetLeads)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-[#8A8680]">
                        Playwright workers are extracting local businesses across Google Maps contexts in
                        parallel.
                      </p>
                    </div>
                  )}

                  {/* Scenario 2: Batch Decision Prompt (Sub-Locations Exhausted & Target Not Met) */}
                  {scraperStatus?.run_state === "waiting_decision" && (
                    <div className="p-4 rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 space-y-4">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <h4 className="text-xs font-bold">
                          Sub-Locations Exhausted • Target Not Reached Yet
                        </h4>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs text-[#111110] dark:text-[#F5F3EF] leading-relaxed">
                          All entered sub-locations for <strong>{scraperStatus.current_area || broadArea}</strong> have been scraped.
                        </p>
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-[#111110] dark:text-white pt-1">
                          <span>
                            Progress: {scraperStatus.leads_collected} / {scraperStatus.target_leads || targetLeads} clean leads
                          </span>
                          <span className="text-[#8A8680]">
                            ({Math.max(0, (scraperStatus.target_leads || targetLeads) - scraperStatus.leads_collected)} remaining)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (scraperStatus.leads_collected /
                                    (scraperStatus.target_leads || targetLeads)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Input for more sub-locations */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-[#111110] dark:text-[#F5F3EF] flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-[#F95721]" />
                            <span>Add More Sub-Locations (one per line)</span>
                          </label>
                          <span className="text-[10px] text-[#8A8680] font-mono">
                            {moreSubLocations.split("\n").filter((s) => s.trim().length > 0).length} entered
                          </span>
                        </div>
                        <textarea
                          value={moreSubLocations}
                          onChange={(e) => setMoreSubLocations(e.target.value)}
                          rows={4}
                          placeholder={"Kalyani Nagar\nViman Nagar\nKharadi\nKoregaon Park"}
                          className="w-full px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-mono text-[#111110] dark:text-[#F5F3EF] outline-none focus:border-[#F95721] transition-all resize-y leading-relaxed"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <button
                          onClick={handleAddMoreLocations}
                          disabled={isActionLoading || !moreSubLocations.trim()}
                          className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#F95721] to-[#E04816] text-white text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-sm sm:col-span-1"
                        >
                          {isActionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>Add & Continue</span>
                        </button>

                        <button
                          onClick={() => handleControlAction("skip")}
                          disabled={isActionLoading}
                          className="py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs font-bold text-[#111110] dark:text-white disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 sm:col-span-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Finish & Keep Leads</span>
                        </button>

                        <button
                          onClick={() => handleControlAction("cancel")}
                          disabled={isActionLoading}
                          className="py-2.5 px-3 rounded-xl border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-bold disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 sm:col-span-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scenario 3: Completed State (Stored in Unassigned Pool) */}
                  {scraperStatus?.run_state === "completed" && (
                    <div className="p-4 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/25 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-4 h-4" />
                        <h4 className="text-xs font-bold">
                          Scrape Completed • {scraperStatus.leads_collected} Clean Leads in Unassigned Pool
                        </h4>
                      </div>
                      <p className="text-xs text-[#8A8680]">
                        All clean, deduplicated leads have landed safely in your <strong>Unassigned Pool</strong>.
                        No leads are assigned to callers without your permission.
                      </p>

                      {assignSuccessMsg && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                          {assignSuccessMsg}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={handleDistributeLeadsEqually}
                          disabled={isActionLoading}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Distribute Leads Equally</span>
                        </button>
                        <a
                          href="/queue"
                          className="py-2 px-3 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-bold text-[#111110] dark:text-white hover:bg-black/10 dark:hover:bg-white/15 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>Manage in Queue</span>
                        </a>
                        <button
                          onClick={() => {
                            // Reset state for new scrape
                            supabase
                              .from("scraper_status")
                              .update({ run_state: "idle", leads_collected: 0, current_batch: 0 })
                              .eq("id", "default")
                              .then(() => fetchScraperTelemetry());
                          }}
                          className="py-2 px-3 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-bold text-[#8A8680] hover:text-[#111110] dark:hover:text-white transition-all"
                        >
                          New Scrape
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scenario 4: Idle & Ready to Scrape (Broad Area + Sub-Locations Form) */}
                  {(!scraperStatus?.run_state || scraperStatus?.run_state === "idle") && (
                    <div className="p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-white/10 space-y-4">
                      {/* 1. Broad Area */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#111110] dark:text-[#F5F3EF] mb-1.5 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#F95721]" />
                          <span>Broad Area</span>
                        </label>
                        <input
                          type="text"
                          value={broadArea}
                          onChange={(e) => setBroadArea(e.target.value)}
                          placeholder="e.g. Hadapsar, Kothrud, Manhattan, Dubai..."
                          className="w-full px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] outline-none focus:border-[#F95721] transition-all"
                        />
                      </div>

                      {/* 2. Sub-Locations (one per line) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-[#111110] dark:text-[#F5F3EF] flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-[#F95721]" />
                            <span>Sub-Locations (one per line)</span>
                          </label>
                          <span className="text-[10px] text-[#8A8680] font-mono">
                            {subLocationsInput.split("\n").filter((s) => s.trim().length > 0).length} entered
                          </span>
                        </div>
                        <textarea
                          value={subLocationsInput}
                          onChange={(e) => setSubLocationsInput(e.target.value)}
                          rows={6}
                          placeholder={"Enter sub-locations, one per line (optional)\ne.g.\nMagarpatta\nAmanora\nSasane Nagar\nSayyed Nagar\nMalwadi"}
                          className="w-full px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-mono text-[#111110] dark:text-[#F5F3EF] outline-none focus:border-[#F95721] transition-all resize-y leading-relaxed"
                        />
                        <p className="text-[10px] text-[#8A8680] mt-1 leading-normal">
                          If provided, workers scrape <strong>only</strong> these exact sub-locations. If left empty, workers scrape the broad area directly.
                        </p>
                      </div>

                      {/* 3. Target Leads */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#111110] dark:text-[#F5F3EF] mb-1.5 flex items-center gap-1.5">
                          <span>Target Leads</span>
                        </label>
                        <input
                          type="number"
                          value={targetLeads}
                          onChange={(e) => setTargetLeads(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] border border-[#ECE8E1] dark:border-white/10 rounded-xl text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] outline-none focus:border-[#F95721] transition-all"
                          min={10}
                          max={5000}
                          step={50}
                        />
                      </div>

                      {/* 4. Start Scrape Button */}
                      {(() => {
                        const subLocsCount = subLocationsInput
                          .split("\n")
                          .map((s) => s.replace(/^[\s•\-\*\d\.\)]+/, "").trim())
                          .filter(Boolean).length;
                        const canStart = !isActionLoading && broadArea.trim().length > 0 && subLocsCount > 0;

                        return (
                          <div className="space-y-1.5">
                            <button
                              onClick={handleStartScrape}
                              disabled={!canStart}
                              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F95721] to-[#E04816] text-white text-xs font-bold hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                              {isActionLoading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Queuing Scrape Job...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>
                                    {subLocsCount > 0
                                      ? `Start Scrape (${subLocsCount} Sub-Locations)`
                                      : "Start Scrape"}
                                  </span>
                                </>
                              )}
                            </button>
                            {subLocsCount === 0 && (
                              <p className="text-[10px] text-amber-500/90 text-center font-medium">
                                ℹ️ Enter at least 1 sub-location above to begin scraping.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
