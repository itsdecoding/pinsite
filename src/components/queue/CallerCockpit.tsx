"use client";

import React, { useState, useEffect } from "react";
import {
  PhoneCall,
  Clock,
  Globe,
  MapPin,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Copy,
  Check,
  User,
  FileText,
  ExternalLink,
  X,
  Loader2,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  website: string | null;
  has_website: boolean;
  address: string | null;
  niche: string;
  area: string;
  score: number;
  status: string;
  assigned_to: string | null;
  attempts_count: number;
  next_callback_at: string | null;
  last_called_at: string | null;
  decision_maker?: string | null;
  cooldown_until?: string | null;
  rejection_reason?: string | null;
  profiles?: {
    full_name: string;
  } | null;
}

export interface CallLogSummary {
  notes: string | null;
  outcome: string;
  called_at: string;
  caller_name?: string;
}

interface CallerCockpitProps {
  leads: Lead[];
  activeLeadIndex: number;
  setActiveLeadIndex: (idx: number) => void;
  currentLead: Lead | null;
  callActive: boolean;
  callElapsedSeconds: number;
  handleStartCall: () => void;
  setIsDrawerOpen: (open: boolean) => void;
  latestCallNote: CallLogSummary | null;
  loadingNote: boolean;
  impersonatedCaller: any;
  copiedPhone: boolean;
  setCopiedPhone: (copied: boolean) => void;
  loadLeads: () => void;
}

function formatLeadName(name: string) {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "No Phone";
  const cleaned = phone.trim().replace(/\D/g, "");
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
  return phone;
}

function formatTelLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/\D/g, "");
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `tel:+91${core10}`;
  return `tel:+91${cleaned}`;
}

function resolveDecisionMaker(lead: Lead | null): string {
  if (!lead) return "Decision Maker";
  if (lead.decision_maker) return lead.decision_maker;
  const name = lead.name || "";
  const match = name.match(/^(Dr\.?\s+[A-Za-z]+|Mr\.?\s+[A-Za-z]+|Mrs\.?\s+[A-Za-z]+|Ms\.?\s+[A-Za-z]+)/i);
  if (match) return `${match[0]} — Owner / Lead Doctor`;
  return "Owner / Managing Director";
}

function formatDurationTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours === 1) return "1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export function CallerCockpit({
  leads,
  activeLeadIndex,
  setActiveLeadIndex,
  currentLead,
  callActive,
  callElapsedSeconds,
  handleStartCall,
  setIsDrawerOpen,
  latestCallNote,
  loadingNote,
  impersonatedCaller,
  copiedPhone,
  setCopiedPhone,
  loadLeads,
}: CallerCockpitProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showPwaPrompt, setShowPwaPrompt] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Detect Mobile PWA status (iOS Safari and Android Chrome non-standalone mode)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
      const isStandalone =
        (window.navigator as any).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      const isDismissed = localStorage.getItem("pinsite_pwa_dismissed") === "true";
      const isMobile =
        /iphone|ipad|ipod|android/i.test(window.navigator.userAgent) || window.innerWidth < 768;

      setIsIosDevice(isIos);

      if (isMobile && !isStandalone && !isDismissed) {
        setShowPwaPrompt(true);
      }

      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        if (!isStandalone && !isDismissed) {
          setShowPwaPrompt(true);
        }
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstall);
      return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    }
  }, []);

  if (!currentLead || leads.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto">
          <CheckCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Queue Complete</h2>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] max-w-sm mx-auto">
          Your outbound queue is clear. Newly assigned leads and callbacks will appear here automatically.
        </p>
        <button
          onClick={loadLeads}
          className="px-5 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm inline-flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check for Updates</span>
        </button>
      </div>
    );
  }

  // Pre-calculate website and map links
  const isMapsUrl =
    currentLead.website?.includes("google.com/maps") ||
    currentLead.website?.includes("maps.app.goo.gl") ||
    currentLead.website?.includes("goo.gl/maps");

  const mapsUrl = isMapsUrl
    ? currentLead.website!
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${currentLead.name} ${currentLead.address || currentLead.area || ""}`
      )}`;

  const realWebsite = currentLead.website && !isMapsUrl ? currentLead.website : null;
  const websiteDisplay = realWebsite
    ? realWebsite.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]
    : null;

  return (
    <div className="w-full max-w-lg mx-auto space-y-3 pb-8">
      {/* Mobile PWA Install Prompt Banner */}
      {showPwaPrompt && (
        <div className="p-2.5 px-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-[#111110] dark:text-[#F5F3EF] shadow-sm">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="text-base shrink-0">📲</span>
            {isIosDevice ? (
              <p className="text-[11px] leading-tight">
                Install app: Tap <strong className="text-amber-700 dark:text-amber-400">Share ⎋</strong> then <strong className="text-amber-700 dark:text-amber-400">&apos;Add to Home Screen&apos;</strong> for full-screen mode
              </p>
            ) : deferredPrompt ? (
              <button
                type="button"
                onClick={async () => {
                  if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const choice = await deferredPrompt.userChoice;
                    if (choice.outcome === "accepted") {
                      setShowPwaPrompt(false);
                    }
                    setDeferredPrompt(null);
                  }
                }}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 underline text-left"
              >
                Tap here to install Pinsite app for full-screen mode &rarr;
              </button>
            ) : (
              <p className="text-[11px] leading-tight">
                Install app: Tap <strong className="text-amber-700 dark:text-amber-400">⋮</strong> then <strong className="text-amber-700 dark:text-amber-400">&apos;Install App&apos;</strong> for full-screen mode
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPwaPrompt(false);
              localStorage.setItem("pinsite_pwa_dismissed", "true");
            }}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#8A8680] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header Bar with Prev / Next Navigation */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono tracking-wider uppercase text-[#F95721] font-bold">
            DIAL QUEUE
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#F95721] text-white text-[11px] font-mono font-bold shadow-sm">
            Lead {activeLeadIndex + 1} of {leads.length}
          </span>
        </div>

        {/* Prev / Next Nav Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveLeadIndex(Math.max(0, activeLeadIndex - 1))}
            disabled={activeLeadIndex === 0}
            className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all active:scale-95 shadow-sm"
            title="Previous lead"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="text-[11px]">Prev</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveLeadIndex(Math.min(leads.length - 1, activeLeadIndex + 1))}
            disabled={activeLeadIndex >= leads.length - 1}
            className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all active:scale-95 shadow-sm"
            title="Next lead"
          >
            <span className="text-[11px]">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mirror Mode Diagnostic Warning Banner (Only in Mirror Mode) */}
      {impersonatedCaller && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5">
          <span className="text-base shrink-0">👁️</span>
          <div className="min-w-0">
            <span className="font-bold font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
              Mirroring {impersonatedCaller.full_name}
            </span>
            <span className="text-[11px] opacity-90 truncate block">
              Direct dialing disabled to protect active session.
            </span>
          </div>
        </div>
      )}

      {/* Main Single-Screen Hero Lead Card */}
      <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5">
        {/* Business Name (Compact 2-line max) */}
        <div>
          <h2
            className="text-xl sm:text-2xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight break-words line-clamp-2"
            title={formatLeadName(currentLead.name)}
          >
            {formatLeadName(currentLead.name)}
          </h2>

          {/* Badges Row (Exact existing badges, single row) */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
              {currentLead.niche}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-black/5 dark:bg-white/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924]">
              {currentLead.area}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border flex items-center gap-1 ${
                (currentLead.attempts_count || 0) >= 4
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-black/5 dark:bg-white/5 text-[#111110] dark:text-[#F5F3EF] border-[#ECE8E1] dark:border-[#2D2924]"
              }`}
            >
              <Clock className="w-3 h-3 text-[#F95721]" />
              <span>
                {(currentLead.attempts_count || 0) === 0
                  ? "Attempt 1/5"
                  : `Attempt ${Math.min(5, currentLead.attempts_count)}/5`}
              </span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20 flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>Ask for: <strong>{resolveDecisionMaker(currentLead)}</strong></span>
            </span>
          </div>
        </div>

        {/* Target Phone Number Block (Immediately below name) */}
        <div className="p-3.5 rounded-2xl bg-[#F95721]/5 dark:bg-[#F95721]/10 border border-[#F95721]/20 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] block">
              Target Phone Number
            </span>
            <span className="text-xl sm:text-2xl font-mono font-black text-[#F95721] tracking-wide select-all block truncate">
              {formatPhoneDisplay(currentLead.phone)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (currentLead?.phone) {
                navigator.clipboard.writeText(currentLead.phone);
                setCopiedPhone(true);
                setTimeout(() => setCopiedPhone(false), 1500);
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#6E6B66] dark:text-[#8A8680] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
            title="Copy phone number"
          >
            {copiedPhone ? (
              <>
                <Check className="w-3.5 h-3.5 text-feedback-success" />
                <span className="text-[11px] text-feedback-success font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Primary Action Buttons: DIAL NOW + LOG OUTCOME */}
        <div className="space-y-2.5 pt-1">
          {impersonatedCaller ? (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                Diagnostic Observer Mode Active
              </span>
            </div>
          ) : (
            <>
              {/* Big DIAL NOW CTA with Integrated Call Duration Timer */}
              <a
                href={formatTelLink(currentLead.phone)}
                onClick={handleStartCall}
                className={`w-full min-h-[50px] py-3.5 px-6 font-bold text-sm uppercase tracking-wider rounded-2xl shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] text-center ${
                  callActive
                    ? "bg-red-600 hover:bg-red-700 text-white ring-4 ring-red-500/30 animate-pulse"
                    : "bg-[#F95721] hover:bg-[#E04612] text-white"
                }`}
              >
                {callActive ? (
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                    <span className="font-mono text-base tracking-wide">
                      CALL IN PROGRESS: {formatDurationTimer(callElapsedSeconds)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 animate-pulse" />
                    <span>DIAL NOW ({formatPhoneDisplay(currentLead.phone)})</span>
                  </div>
                )}
              </a>

              {/* LOG OUTCOME Button */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="w-full min-h-[46px] py-3 px-6 bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Log Outcome</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Single Collapsible "Details >" Affordance */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] flex items-center justify-between transition-colors"
            >
              <span>Lead Details & History</span>
              <ChevronRight
                className={`w-4 h-4 text-[#6E6B66] dark:text-[#8A8680] transition-transform duration-200 ${
                  showDetails ? "rotate-90" : ""
                }`}
              />
            </button>

            {/* Collapsible Content */}
            {showDetails && (
              <div className="pt-3 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Official Website Status */}
                {realWebsite ? (
                  <div className="p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">Website:</span>
                      <span className="truncate text-emerald-700 dark:text-emerald-300 font-mono font-medium">
                        {websiteDisplay}
                      </span>
                    </div>
                    <a
                      href={realWebsite.startsWith("http") ? realWebsite : `https://${realWebsite}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-2.5 py-1 rounded-xl bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">Website:</span>
                      <span className="text-[#6E6B66] dark:text-[#8A8680]">No official website listed</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-mono font-bold text-[10px] tracking-wide uppercase">
                      Pitch Needed
                    </span>
                  </div>
                )}

                {/* Full Address Block */}
                {(currentLead.address || currentLead.area) && (
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <MapPin className="w-4 h-4 text-[#F95721] shrink-0 mt-0.5" />
                      <p className="text-xs text-[#111110] dark:text-[#F5F3EF] font-medium leading-relaxed break-words">
                        {currentLead.address || currentLead.area}
                      </p>
                    </div>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] font-semibold text-[11px] inline-flex items-center gap-1"
                      title="Open in Google Maps"
                    >
                      <span>Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Call History / Previous Note */}
                {loadingNote ? (
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-2 text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F95721]" />
                    <span>Loading past call history...</span>
                  </div>
                ) : latestCallNote?.notes ? (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300 font-mono text-[10px] uppercase tracking-wider">
                        <FileText className="w-3 h-3" />
                        <span>Previous Note ({latestCallNote.outcome.replace("_", " ")})</span>
                      </div>
                      <span className="text-[10px] text-amber-800/80 dark:text-amber-200/80 font-mono">
                        {latestCallNote.caller_name} • {formatRelativeTime(latestCallNote.called_at)}
                      </span>
                    </div>
                    <p className="text-[#111110] dark:text-[#F5F3EF] font-medium leading-relaxed italic bg-white/70 dark:bg-black/30 p-2 rounded-xl border border-amber-500/20">
                      &ldquo;{latestCallNote.notes}&rdquo;
                    </p>
                  </div>
                ) : latestCallNote ? (
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>Last: <strong className="capitalize text-[#111110] dark:text-[#F5F3EF]">{latestCallNote.outcome.replace("_", " ")}</strong></span>
                    </div>
                    <span className="text-[10px] font-mono">{latestCallNote.caller_name} • {formatRelativeTime(latestCallNote.called_at)}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Fresh Lead — No previous call attempts.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
