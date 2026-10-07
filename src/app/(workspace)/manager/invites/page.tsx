"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Mail, Copy, Check, Plus, Loader2, Trash2, RefreshCw, AlertCircle, ShieldAlert } from "lucide-react";

interface Invite {
  id: string;
  token: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export default function ManagerInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("caller");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("/api/invites", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load invites (HTTP ${res.status})`);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("Network request timed out. Please verify your connection.");
      } else {
        setError(err.message || "Unable to fetch invites at this time.");
      }
      console.warn("Failed to load invites:", err);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setIsGenerating(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate invite");
      }

      const { invite } = await res.json();
      setInvites((prev) => [invite, ...prev.filter((i) => i.id !== invite.id)]);
      setEmail("");
    } catch (err: any) {
      alert(err.message || "Failed to generate invite");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    if (!confirm("Are you sure you want to revoke this invitation?")) return;
    try {
      const res = await fetch(`/api/invites?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to revoke invite");
      }
    } catch (err) {
      alert("Failed to revoke invite");
    }
  }

  function copyInviteLink(token: string) {
    const rawOrigin = typeof window !== "undefined" && window.location.origin ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://pinsite.pro");
    const baseOrigin = rawOrigin.replace(/\/studio\/?$/, "").replace(/\/+$/, "");
    const inviteUrl = `${baseOrigin}/studio/signup?token=${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  }

  return (
    <div className="space-y-6 w-full">
      {/* Top Status & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-white dark:bg-[#181715] text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#262420] shadow-sm">
            {invites.length} Issued {invites.length === 1 ? "Invite" : "Invites"}
          </span>
          <span className="text-xs text-[#8A8680] hidden sm:inline">
            Direct signups disabled &bull; Links valid for 7 days
          </span>
        </div>

        <button
          type="button"
          onClick={() => loadInvites()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#181715] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-xs font-medium text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#262420] transition-all disabled:opacity-50 self-end sm:self-auto cursor-pointer shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#F95721] ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      {/* Invite Generation Card */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] uppercase tracking-wider font-mono flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#F95721]" />
            Generate New Seat Invitation
          </h2>
          <span className="text-[11px] text-[#8A8680] font-mono">
            Role Access Assignment
          </span>
        </div>

        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@agency.com"
              className="w-full text-xs px-4 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none transition-all placeholder:text-[#8A8680]"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full text-xs px-4 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none transition-all cursor-pointer"
            >
              <option value="caller">Outbound Caller</option>
              <option value="developer">Web Developer</option>
              <option value="manager">Operations Manager</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={isGenerating || !email.trim()}
              className="w-full py-2.5 px-4 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Generate Link</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error State with Retry Button */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadInvites()}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Active Invites List Card */}
      <div className="bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#111110] dark:text-[#F5F3EF]">
          Issued Invitations ({invites.length})
        </h3>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#F95721]" />
            <p className="text-xs text-[#8A8680] font-mono">Loading seat invitations...</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6E6B66] dark:text-[#8A8680] space-y-1">
            <p className="font-semibold text-[#111110] dark:text-[#F5F3EF]">No invitations active.</p>
            <p className="text-[11px] text-[#8A8680]">
              Create an invitation above to onboard callers or managers.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#262420]/60">
            {invites.map((inv) => {
              const isAccepted = Boolean(inv.accepted_at);
              const isExpired = new Date(inv.expires_at).getTime() < Date.now();

              return (
                <div key={inv.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">{inv.email}</span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] font-semibold border border-[#F95721]/20">
                        {inv.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#8A8680] font-mono block">
                      Expires: {new Date(inv.expires_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {isAccepted ? (
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 font-semibold">
                        Accepted
                      </span>
                    ) : isExpired ? (
                      <span className="text-[11px] font-mono text-red-500 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 font-semibold">
                        Expired
                      </span>
                    ) : (
                      <button
                        onClick={() => copyInviteLink(inv.token)}
                        className="px-3.5 py-1.5 bg-black/5 dark:bg-white/5 hover:border-[#F95721] border border-[#ECE8E1] dark:border-[#262420] text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {copiedToken === inv.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-500">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#F95721]" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      title="Revoke Invite"
                      className="p-1.5 text-[#8A8680] hover:text-red-500 transition-colors rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
