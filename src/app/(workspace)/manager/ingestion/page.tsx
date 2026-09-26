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
} from "lucide-react";

interface IngestStats {
  total: number;
  processed: number;
  inserted: number;
  duplicates: number;
  invalid: number;
}

export default function LeadIngestionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStats(null);
      setErrorMsg(null);
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
            const chunk = rows.slice(i, i + chunkSize).map((row) => ({
              name: row.name || row["Business Name"] || row.company,
              phone: row.phone || row["Phone Number"] || row.mobile,
              website: row.website || row["Website URL"] || row.url,
              address: row.address || row["Full Address"] || row.location,
              niche: row.niche || row.category || row.industry || "General",
              area: row.area || row.city || "Mumbai",
              score: parseInt(row.score || "75", 10),
            }));

            const res = await fetch("/api/leads/ingest", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer dev_ingestion_api_key_secret_123`,
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2">
        <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
          DATA PIPELINE
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
          High-volume lead ingestion.
        </h1>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
          Upload verified lead lists into the master database pool. Batched in 500-row chunks.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-feedback-error/10 border border-feedback-error/20 text-feedback-error text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721] bg-white dark:bg-[#1C1A17] rounded-3xl p-10 text-center cursor-pointer transition-all shadow-sm"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-4">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
          {file ? file.name : "Click to select or drop CSV file"}
        </h3>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
          Accepts headers: <code className="text-[#F95721] font-semibold">name, phone, website, address, niche, area, score</code>
        </p>
      </div>

      {/* Action CTA */}
      {file && (
        <div className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-[#F95721]" />
            <div>
              <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">{file.name}</p>
              <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680]">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>

          <button
            onClick={processAndUpload}
            disabled={isProcessing}
            className="px-6 py-3 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ingesting ({progress}%)...</span>
              </>
            ) : (
              <>
                <span>Start Ingestion</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-2 p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924]">
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
        <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-feedback-success font-bold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Ingestion Batch Completed</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Total Records</span>
              <span className="text-xl font-bold font-mono text-[#111110] dark:text-[#F5F3EF]">{stats.total}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">New Leads Inserted</span>
              <span className="text-xl font-bold font-mono text-feedback-success">{stats.inserted}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Duplicates Skipped</span>
              <span className="text-xl font-bold font-mono text-amber-500">{stats.duplicates}</span>
            </div>

            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block">Invalid Rows</span>
              <span className="text-xl font-bold font-mono text-feedback-error">{stats.invalid}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
