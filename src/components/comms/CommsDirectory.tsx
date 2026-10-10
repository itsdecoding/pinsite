"use client";

import React, { useState, useMemo } from "react";
import {
  Hash,
  Lock,
  MessageSquare,
  Search,
  Plus,
  Users,
  X,
} from "lucide-react";
import { Channel, PublicProfile, DMConversation } from "./useCommsState";

interface CommsDirectoryProps {
  channels: Channel[];
  conversations: DMConversation[];
  teamMembers: PublicProfile[];
  activeView: "channel" | "dm";
  activeChannelId: string | null;
  activeDmUser: PublicProfile | null;
  onlineUsers: Set<string>;
  onSelectChannel: (channelId: string) => void;
  onSelectDm: (member: PublicProfile) => void;
  className?: string;
}

export function CommsDirectory({
  channels,
  conversations,
  teamMembers,
  activeView,
  activeChannelId,
  activeDmUser,
  onlineUsers,
  onSelectChannel,
  onSelectDm,
  className = "",
}: CommsDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "channels" | "dms">("all");

  const totalMembersCount = teamMembers.length + 1;
  const onlineCount = onlineUsers.size;

  // Filter channels based on query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const query = searchQuery.toLowerCase();
    return channels.filter(
      (c) =>
        c.name?.toLowerCase().includes(query) ||
        (c.last_message?.body && c.last_message.body.toLowerCase().includes(query))
    );
  }, [channels, searchQuery]);

  // Filter conversations based on query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.participant?.full_name?.toLowerCase().includes(query) ||
        (c.last_message && c.last_message.body?.toLowerCase().includes(query))
    );
  }, [conversations, searchQuery]);

  // Filter team members for new DM modal
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return teamMembers;
    const query = searchQuery.toLowerCase();
    return teamMembers.filter((m) =>
      m.full_name?.toLowerCase().includes(query)
    );
  }, [teamMembers, searchQuery]);

  const formatSnippetTime = (timestamp?: string) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`h-full flex flex-col bg-white dark:bg-[#111213] border-r border-black/[0.08] dark:border-white/[0.08] overflow-hidden select-none ${className}`}
    >
      {/* WhatsApp-Style Left Header */}
      <div className="p-3 sm:p-3.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/50 dark:bg-[#141516]">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111110] dark:text-white">
              Chats
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {onlineCount} of {totalMembersCount} online
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsNewDmOpen((prev) => !prev)}
            title="Start new direct message"
            className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[#7F3922]/20 text-zinc-600 dark:text-zinc-300 hover:text-[#F95721] transition active:scale-95"
          >
            {isNewDmOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/[0.04] dark:bg-[#1A1B1C] border border-black/[0.06] dark:border-white/[0.06] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111110] dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#7F3922]/60 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* WhatsApp-Style Filter Pills */}
        <div className="flex items-center gap-1.5 mt-2.5">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
              filterTab === "all"
                ? "bg-[#7F3922]/20 dark:bg-[#7F3922]/30 text-[#F95721] font-semibold border border-[#7F3922]/40"
                : "bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("channels")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
              filterTab === "channels"
                ? "bg-[#7F3922]/20 dark:bg-[#7F3922]/30 text-[#F95721] font-semibold border border-[#7F3922]/40"
                : "bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Channels
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("dms")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
              filterTab === "dms"
                ? "bg-[#7F3922]/20 dark:bg-[#7F3922]/30 text-[#F95721] font-semibold border border-[#7F3922]/40"
                : "bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            DMs
          </button>
        </div>
      </div>

      {/* Directory Scrollable Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04] scrollbar-thin scrollbar-thumb-zinc-700/30">
        {/* NEW DM QUICK PICKER MODAL */}
        {isNewDmOpen && (
          <div className="p-3 bg-[#7F3922]/10 border-b border-[#7F3922]/30 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#F95721]">
                Select a teammate to chat
              </span>
              <button
                onClick={() => setIsNewDmOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    onSelectDm(member);
                    setIsNewDmOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-white/10 dark:hover:bg-white/[0.06] transition group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-[#7F3922]/30 text-[#F95721] flex items-center justify-center text-xs font-bold">
                        {(member.full_name || "U").charAt(0).toUpperCase()}
                      </div>
                      {onlineUsers.has(member.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-[#111213]" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {member.full_name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CHANNELS SECTION */}
        {(filterTab === "all" || filterTab === "channels") && (
          <div>
            {filterTab === "all" && (
              <div className="px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Channels
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                  {filteredChannels.length}
                </span>
              </div>
            )}

            <div>
              {filteredChannels.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {searchQuery ? "No matching channels" : "No channels available"}
                  </p>
                </div>
              ) : (
                filteredChannels.map((channel) => {
                  const isSelected =
                    activeView === "channel" && activeChannelId === channel.id;
                  const unread = channel.unread_count || 0;

                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelectChannel(channel.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition group ${
                        isSelected
                          ? "bg-black/[0.06] dark:bg-white/[0.08]"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* WhatsApp-Style Channel Icon */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#7F3922]/15 border border-[#7F3922]/30 flex items-center justify-center text-[#F95721]">
                          {channel.is_private ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Hash className="w-4 h-4" />
                          )}
                        </div>
                      </div>

                      {/* Channel Row Content: Name + Last message preview */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-[#111110] dark:text-zinc-100 truncate">
                            #{channel.name}
                          </span>
                          {channel.last_message && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0 ml-1">
                              {formatSnippetTime(channel.last_message.created_at)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-snug flex-1 mr-2">
                            {channel.last_message ? (
                              <>
                                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                  {channel.last_message.sender_name}:{" "}
                                </span>
                                <span>{channel.last_message.body}</span>
                              </>
                            ) : (
                              <span className="italic text-zinc-400/70">No messages yet</span>
                            )}
                          </p>

                          {/* Unread Badge */}
                          {unread > 0 && (
                            <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#F95721] text-white">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* DIRECT MESSAGES SECTION */}
        {(filterTab === "all" || filterTab === "dms") && (
          <div>
            {filterTab === "all" && (
              <div className="px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Direct Messages
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                  {filteredConversations.length}
                </span>
              </div>
            )}

            <div>
              {filteredConversations.length === 0 && !searchQuery ? (
                <div className="px-3 py-4 text-center">
                  <Users className="w-5 h-5 mx-auto text-zinc-400/50 mb-1" />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    No active direct messages.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsNewDmOpen(true)}
                    className="mt-2 text-[11px] font-semibold text-[#F95721] hover:underline"
                  >
                    + Start a conversation
                  </button>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected =
                    activeView === "dm" &&
                    activeDmUser &&
                    activeDmUser.id === conv.participant.id;
                  const isOnline = onlineUsers.has(conv.participant.id);

                  return (
                    <button
                      key={conv.id}
                      onClick={() => onSelectDm(conv.participant)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition group ${
                        isSelected
                          ? "bg-black/[0.06] dark:bg-white/[0.08]"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Avatar with Online Presence Dot */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-800 dark:text-zinc-200 shadow-sm">
                          {(conv.participant?.full_name || "U").charAt(0).toUpperCase()}
                        </div>
                        {isOnline && (
                          <span
                            title="Online"
                            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111213]"
                          />
                        )}
                      </div>

                      {/* Participant Content: Name, Snippet, Time & Unread Badge */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-[#111110] dark:text-zinc-100 truncate">
                            {conv.participant.full_name}
                          </span>
                          {conv.last_message && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0 ml-1">
                              {formatSnippetTime(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-snug flex-1 mr-2">
                            {conv.last_message ? (
                              conv.last_message.body
                            ) : (
                              <span className="italic text-zinc-400/70">Tap to chat</span>
                            )}
                          </p>

                          {/* Unread Badge */}
                          {conv.unread_count > 0 && (
                            <span className="shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#F95721] text-white">
                              {conv.unread_count > 99 ? "99+" : conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
