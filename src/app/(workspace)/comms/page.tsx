"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Hash,
  MessageSquare,
  Lock,
  Send,
  Edit2,
  Trash2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  profiles?: {
    full_name: string;
    role: string;
  };
}

interface PublicProfile {
  id: string;
  full_name: string;
  role: string;
}

export default function CommsHubPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [activeView, setActiveView] = useState<"channel" | "dm">("channel");
  const [teamMembers, setTeamMembers] = useState<PublicProfile[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<PublicProfile | null>(null);

  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) setCurrentUserId(user.id);

      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name, role");

      if (profiles) setTeamMembers(profiles.filter((p) => p.id !== user?.id));

      const { data: channelData } = await supabase
        .from("channels")
        .select("*")
        .order("name", { ascending: true });

      if (channelData && channelData.length > 0) {
        setChannels(channelData);
        setActiveChannelId(channelData[0].id);
      } else {
        // Fallback default channels
        const defaults: Channel[] = [
          { id: "ch-1", name: "general", description: "Company-wide announcements", is_private: false },
          { id: "ch-2", name: "callers", description: "Outbound squad updates & objection handling", is_private: false },
          { id: "ch-3", name: "developers", description: "Technical blockers & staging links", is_private: false },
          { id: "ch-4", name: "management", description: "Operations & KPI planning", is_private: true },
          { id: "ch-5", name: "wins", description: "Closed deals & milestone celebrations", is_private: false },
          { id: "ch-6", name: "alerts", description: "Automated cron & infrastructure warnings", is_private: false },
        ];
        setChannels(defaults);
        setActiveChannelId(defaults[0].id);
      }
      setLoading(false);
    }

    init();
  }, []);

  useEffect(() => {
    if (!activeChannelId || activeView !== "channel") return;

    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          profiles:sender_id (full_name, role)
        `)
        .eq("channel_id", activeChannelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        setMessages(data as any);
        scrollToBottom();
      } else {
        setMessages([
          {
            id: "msg-1",
            sender_id: "user-system",
            body: "Welcome to the channel. All internal discussions are synchronized live across the agency.",
            created_at: new Date().toISOString(),
            edited_at: null,
            deleted_at: null,
            profiles: { full_name: "Operations Bot", role: "manager" },
          },
        ]);
      }

      if (currentUserId) {
        await supabase.from("channel_reads").upsert({
          channel_id: activeChannelId,
          user_id: currentUserId,
          last_read_at: new Date().toISOString(),
        });
      }
    }

    loadMessages();

    const channelSub = supabase
      .channel(`channel-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as any;
            const { data: sender } = await supabase
              .from("profiles")
              .select("full_name, role")
              .eq("id", newRow.sender_id)
              .maybeSingle();

            setMessages((prev) => [
              ...prev,
              { ...newRow, profiles: sender || { full_name: "Operator", role: "caller" } },
            ]);
            scrollToBottom();
          } else if (payload.eventType === "UPDATE") {
            const updatedRow = payload.new as any;
            if (updatedRow.deleted_at) {
              setMessages((prev) => prev.filter((m) => m.id !== updatedRow.id));
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === updatedRow.id ? { ...m, ...updatedRow } : m))
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [activeChannelId, activeView, currentUserId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending || !currentUserId || !activeChannelId) return;

    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        channel_id: activeChannelId,
        sender_id: currentUserId,
        body: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage("");
    } catch (err: any) {
      // Local optimistic append if supabase local offline
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender_id: currentUserId,
          body: newMessage.trim(),
          created_at: new Date().toISOString(),
          edited_at: null,
          deleted_at: null,
          profiles: { full_name: "Muzammil", role: "admin" },
        },
      ]);
      setNewMessage("");
      scrollToBottom();
    } finally {
      setSending(false);
    }
  }

  async function handleSaveEdit(messageId: string) {
    if (!editText.trim()) return;
    try {
      await supabase
        .from("messages")
        .update({
          body: editText.trim(),
          edited_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, body: editText.trim(), edited_at: new Date().toISOString() } : m
        )
      );
      setEditingMessageId(null);
    } catch (err: any) {
      alert(`Failed to edit message: ${err.message}`);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);

      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err: any) {
      alert(`Failed to delete message: ${err.message}`);
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Connecting to Realtime Mesh...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2">
        <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
          REALTIME COMMUNICATIONS
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
          Stay connected in flow.
        </h1>
      </div>

      {/* Main Chat Island Container */}
      <div className="h-[calc(100vh-220px)] flex rounded-3xl border border-[#ECE8E1] dark:border-[#2D2924] bg-white dark:bg-[#1C1A17] overflow-hidden shadow-sm">
        {/* Sidebar Channels List */}
        <div className="w-64 border-r border-[#ECE8E1] dark:border-[#2D2924] bg-black/[0.02] dark:bg-white/[0.02] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
            <span className="text-xs font-bold uppercase font-mono tracking-wider text-[#111110] dark:text-[#F5F3EF]">
              Hub Channels
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-[#6E6B66] dark:text-[#8A8680] px-2">
                Broadcast Channels
              </span>
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setActiveChannelId(ch.id);
                    setActiveView("channel");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-2xl text-xs flex items-center gap-2.5 transition-all ${
                    activeView === "channel" && activeChannelId === ch.id
                      ? "bg-[#F95721] text-white font-semibold shadow-sm"
                      : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {ch.is_private ? (
                    <Lock className="w-3.5 h-3.5 shrink-0 opacity-75" />
                  ) : (
                    <Hash className="w-3.5 h-3.5 shrink-0 opacity-75" />
                  )}
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-[#6E6B66] dark:text-[#8A8680] px-2">
                Team Operators
              </span>
              {teamMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    setActiveDmUser(member);
                    setActiveView("dm");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-2xl text-xs flex items-center justify-between transition-all ${
                    activeView === "dm" && activeDmUser?.id === member.id
                      ? "bg-[#F95721] text-white font-semibold shadow-sm"
                      : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-feedback-success" />
                    <span className="truncate">{member.full_name}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono opacity-70">
                    {member.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Message Feed Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-[#1C1A17]">
          {/* Header */}
          <div className="p-4 border-b border-[#ECE8E1] dark:border-[#2D2924] flex flex-col gap-1 bg-black/[0.01] dark:bg-white/[0.01]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-[#F95721]" />
                <h2 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                  {activeView === "channel" ? activeChannel?.name : activeDmUser?.full_name}
                </h2>
              </div>
              <span className="text-xs text-[#6E6B66] dark:text-[#8A8680] hidden sm:block">
                {activeChannel?.description}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-[#6E6B66] dark:text-[#8A8680] font-mono pt-1">
              <ShieldAlert className="w-3 h-3 text-[#F95721]" />
              <span>Internal communications are archived for operational quality and audit compliance.</span>
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              const isEditing = editingMessageId === msg.id;

              return (
                <div key={msg.id} className="group flex items-start gap-3.5 text-xs">
                  <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-center font-bold text-[#F95721] shrink-0">
                    {msg.profiles?.full_name ? msg.profiles.full_name[0].toUpperCase() : "U"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">
                        {msg.profiles?.full_name || "Operator"}
                      </span>
                      <span className="text-[10px] font-mono uppercase text-[#6E6B66] dark:text-[#8A8680]">
                        {msg.profiles?.role || "team"}
                      </span>
                      <span className="text-[10px] text-[#9E9A93] dark:text-[#635F59]">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      {msg.edited_at && (
                        <span className="text-[10px] font-mono text-[#6E6B66] dark:text-[#8A8680] italic">
                          (edited)
                        </span>
                      )}

                      {isOwn && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto transition-opacity">
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditText(msg.body);
                            }}
                            className="p-1 text-[#6E6B66] hover:text-[#111110] dark:hover:text-[#F5F3EF] rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1 text-[#6E6B66] hover:text-feedback-error rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full text-xs p-2.5 bg-black/5 dark:bg-white/5 border border-[#F95721] rounded-xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveEdit(msg.id)}
                            className="px-3 py-1 bg-[#F95721] text-white font-semibold text-xs rounded-full"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-3 py-1 text-xs text-[#6E6B66]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[#6E6B66] dark:text-[#8A8680] mt-1 leading-relaxed break-words">
                        {msg.body}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-[#ECE8E1] dark:border-[#2D2924] bg-black/[0.01] dark:bg-white/[0.01] flex items-center gap-3"
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message #${activeChannel?.name || "chat"}...`}
              className="flex-1 text-xs px-4 py-3 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#6E6B66] outline-none"
            />

            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-5 py-3 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
