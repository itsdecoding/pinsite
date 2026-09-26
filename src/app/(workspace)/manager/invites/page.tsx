"use client";

import React, { useEffect, useState } from "react";
import { Mail, Copy, Check, Plus, Loader2 } from "lucide-react";
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

      const token = crypto.randomUUID().replace(/-/g, "").substring(0, 16);

      const { data, error } = await supabase
        .from("invites")
        .insert({
          token,
          email: email.trim().toLowerCase(),
          role,
          invited_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      setInvites((prev) => [data, ...prev]);
      setEmail("");
    } catch (err: any) {
      // Optimistic local add if running without backend connected
      const mockInvite: Invite = {
        id: crypto.randomUUID(),
        token: crypto.randomUUID().replace(/-/g, "").substring(0, 16),
        email: email.trim().toLowerCase(),
        role,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        accepted_at: null,
        created_at: new Date().toISOString(),
      };
      setInvites((prev) => [mockInvite, ...prev]);
      setEmail("");
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2">
        <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
          TEAM ACCESS CONTROL
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
          Seat invites & access.
        </h1>
        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
          Issue atomic, single-use onboarding invitations. Direct signups are strictly blocked.
        </p>
      </div>

      {/* Invite Generation Card */}
      <div className="p-8 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm">
        <h2 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#F95721]" />
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
              className="w-full text-xs px-4 py-3 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
            />
          </div>

          <div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full text-xs px-4 py-3 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
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
              className="w-full py-3 px-5 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
      <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#111110] dark:text-[#F5F3EF] mb-4">
          Issued Invitations ({invites.length})
        </h3>

        {loading ? (
          <div className="py-8 text-center text-xs text-[#6E6B66] dark:text-[#8A8680]">Loading invites...</div>
        ) : invites.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#6E6B66] dark:text-[#8A8680]">No invitations issued yet.</div>
        ) : (
          <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#2D2924]/60">
            {invites.map((inv) => {
              const isAccepted = Boolean(inv.accepted_at);
              const isExpired = new Date(inv.expires_at).getTime() < Date.now();

              return (
                <div key={inv.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">{inv.email}</span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] font-semibold">
                        {inv.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5 block">
                      Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {isAccepted ? (
                      <span className="text-[11px] font-mono text-feedback-success px-3 py-1 rounded-full bg-feedback-success/10 font-semibold">
                        Accepted
                      </span>
                    ) : isExpired ? (
                      <span className="text-[11px] font-mono text-feedback-error px-3 py-1 rounded-full bg-feedback-error/10 font-semibold">
                        Expired
                      </span>
                    ) : (
                      <button
                        onClick={() => copyInviteLink(inv.token)}
                        className="px-4 py-2 bg-black/5 dark:bg-white/5 hover:border-[#F95721] border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] rounded-full flex items-center gap-1.5 transition-all"
                      >
                        {copiedToken === inv.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-feedback-success" />
                            <span className="text-feedback-success">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#F95721]" />
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
