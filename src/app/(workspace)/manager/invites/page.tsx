"use client";

import React, { useEffect, useState } from "react";
import { Mail, Copy, Check, Plus, Loader2, ShieldCheck, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("caller");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const supabase = createClient();

  async function loadInvites() {
    setLoading(true);
    const { data } = await supabase
      .from("invites")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setInvites(data);
    setLoading(false);
  }

  useEffect(() => {
    loadInvites();
  }, []);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setIsGenerating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Authentication required");

      const token = crypto.randomUUID().replace(/-/g, "").substring(0, 16);

      const { data, error } = await supabase
        .from("invites")
        .insert({
          token,
          email: email.trim().toLowerCase(),
          role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setInvites((prev) => [data, ...prev]);
      setEmail("");
    } catch (err: any) {
      alert(`Failed to generate invite: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function copyInviteLink(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/signup?token=${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-4 border-b border-border-subtle">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          Team Onboarding & Invites
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Issue atomic, single-use onboarding invitations. Direct signups are strictly blocked.
        </p>
      </div>

      {/* Invite Generation Card */}
      <div className="p-6 rounded-xl bg-background-card border border-border-subtle shadow-card">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent-primary" />
          Generate New Seat Invitation
        </h2>

        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@agency.com"
              className="w-full text-xs px-3 py-2.5 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-text-primary outline-none"
            />
          </div>

          <div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-text-primary outline-none"
            >
              <option value="caller">Outbound Caller</option>
              <option value="developer">Web Developer</option>
              <option value="manager">Operations Manager</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={isGenerating || !email}
              className="w-full py-2.5 px-4 bg-accent-primary hover:bg-accent-hover text-background-base font-bold text-xs uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
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

      {/* Active Invites List */}
      <div className="bg-background-surface border border-border-subtle rounded-xl p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-text-primary mb-4">
          Issued Invitations ({invites.length})
        </h3>

        {loading ? (
          <div className="py-8 text-center text-xs text-text-secondary">Loading invites...</div>
        ) : invites.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-muted">No invitations issued yet.</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {invites.map((inv) => {
              const isAccepted = Boolean(inv.accepted_at);
              const isExpired = new Date(inv.expires_at).getTime() < Date.now();

              return (
                <div key={inv.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">{inv.email}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-background-elevated text-accent-primary border border-accent-border/40">
                        {inv.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted mt-0.5 block">
                      Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {isAccepted ? (
                      <span className="text-[11px] font-mono text-feedback-success px-2 py-0.5 rounded bg-feedback-success/10 border border-feedback-success/20">
                        Accepted
                      </span>
                    ) : isExpired ? (
                      <span className="text-[11px] font-mono text-feedback-error px-2 py-0.5 rounded bg-feedback-error/10 border border-feedback-error/20">
                        Expired
                      </span>
                    ) : (
                      <button
                        onClick={() => copyInviteLink(inv.token)}
                        className="px-3 py-1.5 bg-background-elevated hover:bg-background-card border border-border-subtle text-xs text-text-primary rounded-md flex items-center gap-1.5 transition-colors"
                      >
                        {copiedToken === inv.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-feedback-success" />
                            <span className="text-feedback-success">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-accent-primary" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    )}
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
