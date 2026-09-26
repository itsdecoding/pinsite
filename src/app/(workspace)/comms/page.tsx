"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Hash,
  MessageSquare,
  Lock,
  Send,
  Edit2,
  Trash2,
  Users,
  Check,
  ShieldAlert,
  Loader2,
  Plus,
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

  // DM state
  const [activeView, setActiveView] = useState<"channel" | "dm">("channel");
  const [teamMembers, setTeamMembers] = useState<PublicProfile[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<PublicProfile | null>(null);

  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
      }

      // Fetch team members from profiles_public
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name, role");

      if (profiles) {
        setTeamMembers(profiles.filter((p) => p.id !== user?.id));
      }

      // Fetch channels
      const { data: channelData } = await supabase
        .from("channels")
        .select("*")
        .order("name", { ascending: true });

      if (channelData && channelData.length > 0) {
        setChannels(channelData);
        setActiveChannelId(channelData[0].id);
      }
      setLoading(false);
    }

    init();
  }, []);

  // Load channel messages and subscribe to Realtime
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

      if (data) {
        setMessages(data as any);
        scrollToBottom();
      }

      // Update channel_reads (Dev 5 requirement)
      if (currentUserId) {
        await supabase.from("channel_reads").upsert({
          channel_id: activeChannelId,
          user_id: currentUserId,
          last_read_at: new Date().toISOString(),
        });
      }
    }

    loadMessages();

    // Realtime message subscription
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

  // Send message
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
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  // Edit message
  async function handleSaveEdit(messageId: string) {
    if (!editText.trim()) return;
    try {
      const { error } = await supabase
        .from("messages")
        .update({
          body: editText.trim(),
          edited_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;
      setEditingMessageId(null);
    } catch (err: any) {
      alert(`Failed to edit message: ${err.message}`);
    }
  }

  // Soft-delete message
  async function handleDeleteMessage(messageId: string) {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      const { error } = await supabase
        .from("messages")
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err: any) {
      alert(`Failed to delete message: ${err.message}`);
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-xs font-mono uppercase tracking-wider">Connecting to Realtime Mesh...</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex rounded-xl border border-border-subtle bg-background-surface overflow-hidden shadow-card">
      {/* Sidebar: Channels & Direct Messages */}
      <div className="w-64 border-r border-border-subtle bg-background-elevated/40 flex flex-col shrink-0">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <span className="text-xs font-bold uppercase font-mono tracking-wider text-text-primary">
            Communications
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Channels Section */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-text-muted px-2">Channels</span>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannelId(ch.id);
                  setActiveView("channel");
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                  activeView === "channel" && activeChannelId === ch.id
                    ? "bg-accent-subtle text-accent-primary font-bold border border-accent-border/40"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                }`}
              >
                {ch.is_private ? (
                  <Lock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                ) : (
                  <Hash className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                )}
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>

          {/* Direct Messages Section */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-text-muted px-2">
              Direct Messages
            </span>
            {teamMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => {
                  setActiveDmUser(member);
                  setActiveView("dm");
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  activeView === "dm" && activeDmUser?.id === member.id
                    ? "bg-accent-subtle text-accent-primary font-bold border border-accent-border/40"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-feedback-success" />
                  <span className="truncate">{member.full_name}</span>
                </div>
                <span className="text-[10px] uppercase font-mono text-text-muted">
                  {member.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Feed */}
      <div className="flex-1 flex flex-col bg-background-base">
        {/* Chat Header */}
        <div className="p-4 border-b border-border-subtle bg-background-surface/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeView === "channel" ? (
                <>
                  <Hash className="w-5 h-5 text-accent-primary" />
                  <h2 className="text-sm font-bold text-text-primary">{activeChannel?.name}</h2>
                </>
              ) : (
                <>
                  <MessageSquare className="w-5 h-5 text-accent-primary" />
                  <h2 className="text-sm font-bold text-text-primary">
                    Direct Message: {activeDmUser?.full_name}
                  </h2>
                </>
              )}
            </div>

            {activeView === "channel" && activeChannel?.description && (
              <span className="text-xs text-text-muted hidden sm:block">
                {activeChannel.description}
              </span>
            )}
          </div>

          {/* Manager DM audit disclaimer banner (Dev 5 Requirement 3) */}
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono pt-1">
            <ShieldAlert className="w-3 h-3 text-accent-primary" />
            <span>Internal communications are archived for operational quality and audit compliance.</span>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-16 text-xs text-text-muted">
              Welcome to #{activeChannel?.name}. Start the discussion.
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              const isEditing = editingMessageId === msg.id;

              return (
                <div key={msg.id} className="group flex items-start gap-3 text-xs">
                  <div className="w-8 h-8 rounded-full bg-background-elevated border border-border-subtle flex items-center justify-center font-bold text-accent-primary shrink-0">
                    {msg.profiles?.full_name ? msg.profiles.full_name[0].toUpperCase() : "U"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-text-primary">
                        {msg.profiles?.full_name || "Operator"}
                      </span>
                      <span className="text-[10px] font-mono uppercase text-text-muted">
                        {msg.profiles?.role || "team"}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      {msg.edited_at && (
                        <span className="text-[10px] font-mono text-text-muted italic">
                          (edited)
                        </span>
                      )}

                      {/* Edit & Delete Actions for Senders */}
                      {isOwn && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto transition-opacity">
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditText(msg.body);
                            }}
                            className="p-1 text-text-muted hover:text-text-primary rounded"
                            title="Edit message"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1 text-text-muted hover:text-feedback-error rounded"
                            title="Delete message"
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
                          className="w-full text-xs p-2 bg-background-input border border-border-focus rounded text-text-primary outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveEdit(msg.id)}
                            className="px-2.5 py-1 bg-accent-primary text-background-base font-semibold text-xs rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-text-secondary mt-1 leading-relaxed break-words">
                        {msg.body}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-border-subtle bg-background-surface/40 flex items-center gap-3"
        >
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message #${activeChannel?.name || "chat"}...`}
            className="flex-1 text-xs px-3.5 py-2.5 bg-background-input border border-border-subtle focus:border-border-focus rounded-lg text-text-primary placeholder:text-text-placeholder outline-none"
          />

          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="px-4 py-2.5 bg-accent-primary hover:bg-accent-hover text-background-base font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
