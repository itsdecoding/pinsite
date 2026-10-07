"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Sparkles,
  MapPin,
  Tag,
  Gauge,
  Eye,
  RotateCcw,
} from "lucide-react";

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

export default function LeadIngestionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<IngestionStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detected and customizable campaign parameters
  const [targetNiche, setTargetNiche] = useState("Dentist");
  const [targetArea, setTargetArea] = useState("Kothrud, Pune");
  const [targetScore, setTargetScore] = useState(75);
  const [previewRows, setPreviewRows] = useState<ParsedPreview[]>([]);

  // Helper to extract values case-insensitively
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

  function detectMetadataFromFilename(filename: string) {
    const lower = filename.toLowerCase();

    // 1. Detect Niche
    let detectedNiche = "Dentist";
    if (lower.includes("dentist")) detectedNiche = "Dentist";
    else if (lower.includes("gym")) detectedNiche = "Gym & Fitness";
    else if (lower.includes("restaurant") || lower.includes("cafe")) detectedNiche = "Restaurant";
    else if (lower.includes("salon") || lower.includes("spa")) detectedNiche = "Salon & Spa";
    else if (lower.includes("clinic") || lower.includes("hospital")) detectedNiche = "Healthcare";
    else detectedNiche = "General";
    setTargetNiche(detectedNiche);

    // 2. Detect Area
    let detectedArea = "Kothrud, Pune";
    if (lower.includes("kothrud")) detectedArea = "Kothrud, Pune";
    else if (lower.includes("aundh")) detectedArea = "Aundh, Pune";
    else if (lower.includes("hadapsar")) detectedArea = "Hadapsar, Pune";
    else if (lower.includes("baner")) detectedArea = "Baner, Pune";
    else if (lower.includes("bandra")) detectedArea = "Bandra, Mumbai";
    else if (lower.includes("colaba")) detectedArea = "Colaba, Mumbai";
    else if (lower.includes("hyderabad")) detectedArea = "Hyderabad";
    else if (lower.includes("bengaluru") || lower.includes("bangalore")) detectedArea = "Bengaluru";
    else if (lower.includes("pune")) detectedArea = "Pune";
    else if (lower.includes("mumbai")) detectedArea = "Mumbai";
    else detectedArea = "Pune";
    setTargetArea(detectedArea);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setStats(null);
      setErrorMsg(null);
      detectMetadataFromFilename(selectedFile.name);

      // Parse first few rows for live preview
      Papa.parse(selectedFile, {
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

  const processAndUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setErrorMsg(null);

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
              const area = getVal(row, ["area", "city", "locality"]) || targetArea || "Kothrud, Pune";
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
            setProgress(Math.round((processedCount / totalRows) * 100));

            setStats({
              total: totalRows,
              processed: processedCount,
              inserted: currentInserted,
              duplicates: currentDuplicates,
              invalid: currentInvalid,
            });
          }
        } catch (err: any) {
          setErrorMsg(err.message || "Failed to complete CSV ingestion.");
        } finally {
          setIsProcessing(false);
        }
      },
      error: (err) => {
        setErrorMsg(`CSV Parse Error: ${err.message}`);
        setIsProcessing(false);
      },
    });
  };

  return (
    <div className="space-y-6 w-full">
      {/* Top Status & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-white dark:bg-[#181715] text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#262420] shadow-sm">
            Format: .CSV (UTF-8)
          </span>
          <span className="text-xs text-[#8A8680] hidden sm:inline">
            Auto-normalizes to +91 &bull; Strips invalid numbers
          </span>
        </div>

        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setStats(null);
              setPreviewRows([]);
              setErrorMsg(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#181715] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-xs font-medium text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#262420] transition-all cursor-pointer self-end sm:self-auto shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#F95721]" />
            <span>Reset File</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[#ECE8E1] dark:border-[#262420] hover:border-[#F95721] bg-white dark:bg-[#181715] rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all shadow-sm group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
          {file ? file.name : "Click to select or drop your Scraper CSV"}
        </h3>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
          Supports: <code className="text-[#F95721] font-semibold">Business Name, Phone Number, Address, Google Maps Link</code>
        </p>
      </div>

      {/* File Configuration Panel */}
      {file && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#ECE8E1] dark:border-[#262420]">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-[#F95721]" />
              <div>
                <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">{file.name}</p>
                <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680]">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#F95721] bg-[#F95721]/10 px-3 py-1 rounded-full w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Metadata Detected</span>
            </div>
          </div>

          {/* Metadata Customization Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-[#F95721]" />
                Target Niche
              </label>
              <input
                type="text"
                value={targetNiche}
                onChange={(e) => setTargetNiche(e.target.value)}
                placeholder="e.g. Dentist"
                className="w-full text-xs px-3.5 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#F95721]" />
                Target Area / City
              </label>
              <input
                type="text"
                value={targetArea}
                onChange={(e) => setTargetArea(e.target.value)}
                placeholder="e.g. Kothrud, Pune"
                className="w-full text-xs px-3.5 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-[#F95721]" />
                Initial Lead Score
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={targetScore}
                onChange={(e) => setTargetScore(parseInt(e.target.value, 10) || 75)}
                className="w-full text-xs px-3.5 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
              />
            </div>
          </div>

          {/* Live Preview Sample */}
          {previewRows.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#F95721]" />
                Sample Extracted Records
              </span>
              <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#262420]/60 bg-black/5 dark:bg-white/5 rounded-2xl p-3 text-xs">
                {previewRows.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                    <span className="font-bold text-[#111110] dark:text-[#F5F3EF] truncate max-w-xs">{item.name || "Untitled Business"}</span>
                    <span className="font-mono text-[#F95721]">{item.phone || "No phone"}</span>
                    <span className="text-[#6E6B66] dark:text-[#8A8680] truncate max-w-sm">{item.address || "No address"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={processAndUpload}
              disabled={isProcessing}
              className="px-6 py-3 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-md flex items-center gap-2 transition-all disabled:opacity-50 active:scale-95"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ingesting ({progress}%)...</span>
                </>
              ) : (
                <>
                  <span>Import Verified Leads</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isProcessing && (
        <div className="space-y-2 p-5 rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420]">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#6E6B66] dark:text-[#8A8680]">Batch Progress</span>
            <span className="text-[#F95721] font-bold">{progress}%</span>
          </div>
          <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F95721] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats Summary Card */}
      {stats && (
        <div className="bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-feedback-success font-bold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Ingestion Batch Completed Successfully</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Total Records in File</span>
              <span className="text-xl font-bold font-mono text-[#111110] dark:text-[#F5F3EF]">{stats.total}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">New Leads Inserted</span>
              <span className="text-xl font-bold font-mono text-feedback-success">{stats.inserted}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Duplicates Skipped</span>
              <span className="text-xl font-bold font-mono text-amber-500">{stats.duplicates}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Invalid / No-Phone Skipped</span>
              <span className="text-xl font-bold font-mono text-feedback-error">{stats.invalid}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
