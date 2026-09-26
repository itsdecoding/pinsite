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
  Database,
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
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          High-Volume Lead Ingestion
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Upload verified lead lists into the master database pool. Batched in 500-row chunks.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-lg bg-feedback-error/10 border border-feedback-error/20 text-feedback-error text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border-medium hover:border-accent-primary/60 bg-background-card hover:bg-background-elevated rounded-xl p-8 text-center cursor-pointer transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-full bg-accent-subtle border border-accent-border flex items-center justify-center mx-auto mb-4 text-accent-primary">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-text-primary">
          {file ? file.name : "Click to browse or drop CSV file"}
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Accepts headers: <code className="text-accent-primary">name, phone, website, address, niche, area, score</code>
        </p>
      </div>

      {/* Action CTA */}
      {file && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-background-surface border border-border-subtle">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-accent-primary" />
            <div>
              <p className="text-xs font-semibold text-text-primary">{file.name}</p>
              <p className="text-[11px] text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>

          <button
            onClick={processAndUpload}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-accent-primary hover:bg-accent-hover text-background-base font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
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

      {/* Progress & Live Ingestion Stats */}
      {isProcessing && (
        <div className="space-y-2 p-4 rounded-xl bg-background-surface border border-border-subtle">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-text-secondary">Batch Upload Progress</span>
            <span className="text-accent-primary font-bold">{progress}%</span>
          </div>
          <div className="h-2 w-full bg-background-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {stats && (
        <div className="bg-background-card border border-border-subtle rounded-xl p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2 text-feedback-success font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Ingestion Batch Completed</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-3 rounded-lg bg-background-surface border border-border-subtle">
              <span className="text-[11px] text-text-muted block">Total Records</span>
              <span className="text-lg font-bold font-mono text-text-primary">{stats.total}</span>
            </div>

            <div className="p-3 rounded-lg bg-background-surface border border-border-subtle">
              <span className="text-[11px] text-text-muted block">New Leads Inserted</span>
              <span className="text-lg font-bold font-mono text-feedback-success">{stats.inserted}</span>
            </div>

            <div className="p-3 rounded-lg bg-background-surface border border-border-subtle">
              <span className="text-[11px] text-text-muted block">Duplicates Skipped</span>
              <span className="text-lg font-bold font-mono text-feedback-warning">{stats.duplicates}</span>
            </div>

            <div className="p-3 rounded-lg bg-background-surface border border-border-subtle">
              <span className="text-[11px] text-text-muted block">Invalid Format</span>
              <span className="text-lg font-bold font-mono text-feedback-error">{stats.invalid}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
