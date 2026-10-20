"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Palette,
  Type,
  Trash2,
  Loader2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { Lead } from "./CallerCockpit";

interface ManagerPreviewCockpitProps {
  lead: any;
  userRole?: string;
  viewingAs?: "caller" | "manager";
  onPreviewUpdated?: (newSlug: string | null) => void;
  compact?: boolean;
}

const THEME_OPTIONS = [
  { id: "industrial-slate", name: "Industrial Slate (Trades/HVAC)" },
  { id: "medical-mint", name: "Medical Mint (Dental/Clinic)" },
  { id: "luxury-obsidian", name: "Luxury Obsidian (Legal/Aesthetic)" },
  { id: "electric-azure", name: "Electric Azure (Auto/Tech)" },
  { id: "warm-terracotta", name: "Warm Terracotta (Boutique/Food)" },
];

const FONT_OPTIONS = [
  { id: "bold-industrial", name: "Anton + Plus Jakarta (Punchy)" },
  { id: "editorial-newsreader", name: "Newsreader + Plus Jakarta (Editorial)" },
  { id: "tech-grotesk", name: "Space Grotesk + Plus Jakarta (Modern)" },
  { id: "modern-clean", name: "Plus Jakarta + Inter (Crisp Clean)" },
];

export function ManagerPreviewCockpit({
  lead,
  userRole = "caller",
  viewingAs = "caller",
  onPreviewUpdated,
  compact = false,
}: ManagerPreviewCockpitProps) {
  // STRICT ROLE BOUNDARY: Strictly visible to managers and admins
  const isManagerOrAdmin =
    userRole === "manager" || userRole === "admin" || viewingAs === "manager";

  const [slug, setSlug] = useState<string | null>(lead.active_preview_slug || null);
  const [theme, setTheme] = useState<string>("industrial-slate");
  const [fontPairing, setFontPairing] = useState<string>("bold-industrial");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPatching, setIsPatching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [copied, setCopied] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Sync state when lead changes
  useEffect(() => {
    setSlug(lead.active_preview_slug || null);
    setStatusNotice(null);
    setErrorNotice(null);
  }, [lead.id, lead.active_preview_slug]);

  if (!isManagerOrAdmin) {
    return null; // Invisible to standard callers
  }

  const previewUrl = slug
    ? typeof window !== "undefined"
      ? `${window.location.origin}/${slug}`
      : `https://pinsite.pro/${slug}`
    : null;

  // Flash notice helper
  const showFlash = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  // 1. Generate preview via POST
  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorNotice(null);
    setStatusNotice("Analyzing CRM data and drafting copy with Gemini Flash...");

    try {
      const res = await fetch("/api/preview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Generation failed.");
      }

      setSlug(data.slug);
      if (data.theme) setTheme(data.theme);
      if (data.fontPairing) setFontPairing(data.fontPairing);
      onPreviewUpdated?.(data.slug);
      showFlash("✨ Bespoke website preview generated and live!");
    } catch (err: any) {
      console.error("Preview generation error:", err);
      setErrorNotice(err.message || "Failed to generate preview.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Granular Theme Swap via PATCH
  const handleThemeChange = async (newTheme: string) => {
    if (!slug || isPatching) return;
    setIsPatching(true);
    setErrorNotice(null);

    try {
      const res = await fetch("/api/preview/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, theme: newTheme }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Theme patch failed.");
      }

      setTheme(newTheme);
      showFlash("🎨 Palette updated in 12ms!");
    } catch (err: any) {
      console.error("Theme patch error:", err);
      setErrorNotice(err.message || "Failed to update theme.");
    } finally {
      setIsPatching(false);
    }
  };

  // 3. Granular Font Swap via PATCH
  const handleFontChange = async (newFont: string) => {
    if (!slug || isPatching) return;
    setIsPatching(true);
    setErrorNotice(null);

    try {
      const res = await fetch("/api/preview/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, fontPairing: newFont }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Font patch failed.");
      }

      setFontPairing(newFont);
      showFlash("✍️ Typography updated in 12ms!");
    } catch (err: any) {
      console.error("Font patch error:", err);
      setErrorNotice(err.message || "Failed to update typography.");
    } finally {
      setIsPatching(false);
    }
  };

  // 4. Permanent Wipe via DELETE
  const handleDelete = async () => {
    if (!slug || isDeleting) return;

    const confirmed = window.confirm(
      `Permanently delete this preview for "${lead.name}"? This removes the hosted preview URL and frees the lead.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorNotice(null);

    try {
      const res = await fetch(`/api/preview/generate?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Delete failed.");
      }

      setSlug(null);
      onPreviewUpdated?.(null);
      showFlash("🗑️ Preview permanently removed.");
    } catch (err: any) {
      console.error("Preview deletion error:", err);
      setErrorNotice(err.message || "Failed to delete preview.");
    } finally {
      setIsDeleting(false);
    }
  };

  // 5. Copy pitch to clipboard
  const handleCopyPitch = () => {
    if (!previewUrl) return;
    const dm = lead.decision_maker || "there";
    const text = `Hi ${dm}, I'm Muzammil from Pinsite. Here is the custom concept website our creative team designed specifically for ${lead.name}:\n\n${previewUrl}\n\nTake a quick look on your phone and let me know your thoughts!`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // 6. Direct WhatsApp Lead CTA
  const handleWhatsApp = () => {
    if (!previewUrl) return;
    const cleanPhone = (lead.normalized_phone || lead.phone).replace(/[^0-9]/g, "");
    const dm = lead.decision_maker || "there";
    const text = `Hi ${dm}, I'm Muzammil from Pinsite. Here is the custom concept website our creative team designed specifically for ${lead.name}:\n\n${previewUrl}\n\nTake a quick look on your phone and let me know your thoughts!`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full bg-[#121217] border border-[#F95721]/30 rounded-2xl p-3.5 shadow-xl text-left my-2 relative overflow-hidden transition-all">
      {/* Top Banner Tag */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08] mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F95721] animate-ping" />
          <span className="text-[10px] font-black uppercase tracking-wider text-[#F95721]">
            Manager Website Engine
          </span>
        </div>
        <span className="text-[9px] text-zinc-400 font-medium">
          Gemini Flash • 100% Mobile First
        </span>
      </div>

      {/* Notices */}
      {statusNotice && (
        <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">{statusNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="truncate">{errorNotice}</span>
        </div>
      )}

      {/* STATE A: NO PREVIEW YET */}
      {!slug && (
        <div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-[#F95721] to-amber-600 hover:from-[#ea4610] hover:to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-[#F95721]/20 flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Crafting Bespoke Preview (~1.5s)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span>⚡ Generate Custom Preview (30s)</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-zinc-400 text-center mt-1.5">
            Auto-intakes niche, address &amp; phone from CRM. Writes localized copy.
          </p>
        </div>
      )}

      {/* STATE B: PREVIEW ACTIVE */}
      {slug && previewUrl && (
        <div className="space-y-2.5">
          {/* Active Preview Pill Card */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-emerald-500/30">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] uppercase font-bold text-emerald-400 block leading-tight">
                  Live Concept Active
                </span>
                <span className="text-xs font-mono text-zinc-200 truncate block">
                  pinsite.pro/{slug}
                </span>
              </div>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 transition shrink-0"
            >
              <span>View</span>
              <ExternalLink className="w-3 h-3 text-zinc-400" />
            </a>
          </div>

          {/* Action Row: Copy & WhatsApp */}
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={handleCopyPitch}
              className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl border border-white/10 flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy Pitch</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 text-white" />
              <span>WhatsApp Lead</span>
            </button>
          </div>

          {/* Granular Tweak Controls (Request 8) */}
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              <span>Granular Aesthetic Controls</span>
              {isPatching && (
                <span className="text-[#F95721] flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Swapping...
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Theme Dropdown */}
              <div className="relative">
                <label className="text-[9px] text-zinc-400 block mb-0.5 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-zinc-400" />
                  <span>Theme Palette</span>
                </label>
                <select
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value)}
                  disabled={isPatching}
                  className="w-full bg-[#18181f] border border-white/10 text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#F95721] transition cursor-pointer"
                >
                  {THEME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Dropdown */}
              <div className="relative">
                <label className="text-[9px] text-zinc-400 block mb-0.5 flex items-center gap-1">
                  <Type className="w-3 h-3 text-zinc-400" />
                  <span>Typography</span>
                </label>
                <select
                  value={fontPairing}
                  onChange={(e) => handleFontChange(e.target.value)}
                  disabled={isPatching}
                  className="w-full bg-[#18181f] border border-white/10 text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#F95721] transition cursor-pointer"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Permanent Purge Button */}
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[9px] text-zinc-400">Created mistake? Purge cleanly:</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 px-2 py-1 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-500/20 rounded-lg active:scale-95 transition"
              >
                {isDeleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                <span>Delete Preview</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
