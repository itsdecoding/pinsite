"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Hash,
  Lock,
  Search,
  Plus,
  X,
  Pin,
  CheckCheck,
  MessageSquare,
  MessageSquarePlus,
  Users,
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
  currentUserId?: string;
  onSelectChannel: (channelId: string) => void;
  onSelectDm: (member: PublicProfile) => void;
  className?: string;
}

// Auto-assigned vibrant palette per user/channel so avatars are never uniform dull gray
const AVATAR_PALETTE = [
  "bg-emerald-600 text-white",
  "bg-indigo-600 text-white",
  "bg-purple-600 text-white",
  "bg-rose-600 text-white",
  "bg-amber-600 text-white",
  "bg-sky-600 text-white",
  "bg-teal-600 text-white",
  "bg-orange-600 text-white",
  "bg-pink-600 text-white",
  "bg-violet-600 text-white",
  "bg-blue-600 text-white",
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

// WhatsApp-style timestamp formatting: "1:07 am", "Yesterday", "Tuesday", or "Sep 30, 1:07 am"
function formatWhatsAppTime(timestamp?: string): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return "Yesterday";
    }

    const dayDiff = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (dayDiff < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }

    return `${date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })}, ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } catch {
    return "";
  }
}

interface UnifiedChatRow {
  id: string;
  type: "channel" | "dm";
  name: string;
  avatarChar: string;
  avatarBg: string;
  isOnline: boolean;
  isPrivate?: boolean;
  lastMessageText: string;
  lastMessageTime?: string;
  lastMessageTimestamp: number;
  isLastFromMe: boolean;
  unreadCount: number;
  isPinned: boolean;
  channel?: Channel;
  dmMember?: PublicProfile;
}

export function CommsDirectory({
  channels,
  conversations,
  teamMembers,
  activeView,
  activeChannelId,
  activeDmUser,
  onlineUsers,
  currentUserId,
  onSelectChannel,
  onSelectDm,
  className = "",
}: CommsDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<
    "all" | "unread" | "channels" | "dms" | "pinned"
  >("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  // Load pinned chats from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("agency_pinned_chats");
      if (stored) {
        setPinnedIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore localStorage read error
    }
  }, []);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(
          "agency_pinned_chats",
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Ignore localStorage write error
      }
      return next;
    });
  };

  // Build unified chats roster
  const allChats = useMemo<UnifiedChatRow[]>(() => {
    const list: UnifiedChatRow[] = [];

    // 1. Channels
    channels.forEach((c) => {
      const isPinned = pinnedIds.has(c.id);
      const isLastFromMe = Boolean(
        currentUserId && c.last_message?.sender_id === currentUserId
      );
      const lastText = c.last_message
        ? c.last_message.sender_name
          ? `${c.last_message.sender_name}: ${c.last_message.body}`
          : c.last_message.body
        : "No messages yet";

      list.push({
        id: c.id,
        type: "channel",
        name: `#${c.name}`,
        avatarChar: "#",
        avatarBg: getAvatarColor(c.name),
        isOnline: false,
        isPrivate: c.is_private,
        lastMessageText: lastText,
        lastMessageTime: c.last_message?.created_at,
        lastMessageTimestamp: c.last_message?.created_at
          ? new Date(c.last_message.created_at).getTime()
          : 0,
        isLastFromMe,
        unreadCount: c.unread_count || 0,
        isPinned,
        channel: c,
      });
    });

    // 2. Active DM Conversations
    conversations.forEach((conv) => {
      const isPinned = pinnedIds.has(conv.participant.id);
      const isLastFromMe = Boolean(
        currentUserId && conv.last_message?.sender_id === currentUserId
      );
      const isOnline = onlineUsers.has(conv.participant.id);

      list.push({
        id: conv.participant.id,
        type: "dm",
        name: conv.participant.full_name,
        avatarChar: (conv.participant.full_name || "U")
          .charAt(0)
          .toUpperCase(),
        avatarBg: getAvatarColor(conv.participant.id),
        isOnline,
        lastMessageText: conv.last_message?.body || "No messages yet",
        lastMessageTime: conv.last_message?.created_at,
        lastMessageTimestamp: conv.last_message?.created_at
          ? new Date(conv.last_message.created_at).getTime()
          : new Date(conv.updated_at).getTime(),
        isLastFromMe,
        unreadCount: conv.unread_count || 0,
        isPinned,
        dmMember: conv.participant,
      });
    });

    return list;
  }, [channels, conversations, pinnedIds, currentUserId, onlineUsers]);

  // Total unread count across all conversations and channels
  const totalUnreadCount = useMemo(() => {
    return allChats.reduce((acc, chat) => acc + chat.unreadCount, 0);
  }, [allChats]);

  // Filter and sort unified chats
  const { pinnedChats, unpinnedChats } = useMemo(() => {
    let result = allChats;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (chat) =>
          chat.name.toLowerCase().includes(q) ||
          chat.lastMessageText.toLowerCase().includes(q)
      );
    }

    // Filter chip tab
    if (filterTab === "unread") {
      result = result.filter((chat) => chat.unreadCount > 0);
    } else if (filterTab === "channels") {
      result = result.filter((chat) => chat.type === "channel");
    } else if (filterTab === "dms") {
      result = result.filter((chat) => chat.type === "dm");
    } else if (filterTab === "pinned") {
      result = result.filter((chat) => chat.isPinned);
    }

    const pinned: UnifiedChatRow[] = [];
    const unpinned: UnifiedChatRow[] = [];

    result.forEach((chat) => {
      if (chat.isPinned) {
        pinned.push(chat);
      } else {
        unpinned.push(chat);
      }
    });

    // Sort by latest message timestamp descending
    pinned.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    unpinned.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

    return { pinnedChats: pinned, unpinnedChats: unpinned };
  }, [allChats, searchQuery, filterTab]);

  const totalVisible = pinnedChats.length + unpinnedChats.length;

  // Filter team members for new chat bottom sheet
  const filteredTeamMembers = useMemo(() => {
    if (!searchQuery.trim()) return teamMembers;
    const q = searchQuery.toLowerCase();
    return teamMembers.filter((m) =>
      m.full_name?.toLowerCase().includes(q)
    );
  }, [teamMembers, searchQuery]);

  const handleRowClick = (chat: UnifiedChatRow) => {
    if (chat.type === "channel" && chat.channel) {
      onSelectChannel(chat.channel.id);
    } else if (chat.type === "dm" && chat.dmMember) {
      onSelectDm(chat.dmMember);
    }
  };

  const renderChatRow = (chat: UnifiedChatRow) => {
    const isSelected =
      chat.type === "channel"
        ? activeView === "channel" && activeChannelId === chat.id
        : activeView === "dm" &&
          activeDmUser &&
          activeDmUser.id === chat.id;

    const hasUnread = chat.unreadCount > 0;

    return (
      <div
        key={`${chat.type}-${chat.id}`}
        role="button"
        tabIndex={0}
        onClick={() => handleRowClick(chat)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick(chat);
          }
        }}
        className={`group relative min-h-[72px] px-4 py-3 flex items-center gap-3 w-full min-w-0 max-w-full text-left transition select-none cursor-pointer overflow-hidden box-border ${
          isSelected
            ? "bg-black/[0.06] dark:bg-white/[0.08]"
            : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] active:bg-black/[0.06] dark:active:bg-white/[0.06]"
        }`}
      >
        {/* Left: 52px Avatar with auto-assigned color + online green ring */}
        <div className="relative shrink-0">
          <div
            className={`w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${
              chat.avatarBg
            } ${
              chat.isOnline
                ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-[#111213]"
                : ""
            }`}
          >
            {chat.type === "channel" ? (
              chat.isPrivate ? (
                <Lock className="w-5 h-5 stroke-[2.5]" />
              ) : (
                <Hash className="w-5 h-5 stroke-[2.5]" />
              )
            ) : (
              chat.avatarChar
            )}
          </div>
          {chat.isOnline && (
            <span
              title="Online"
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111213]"
            />
          )}
        </div>

        {/* Center: Name & Last Message preview */}
        <div className="min-w-0 flex-1 flex flex-col justify-center overflow-hidden">
          <div className="flex items-center justify-between mb-0.5 w-full min-w-0 gap-2">
            <h4
              className={`text-[16px] truncate leading-tight min-w-0 flex-1 ${
                hasUnread
                  ? "font-bold text-[#111110] dark:text-white"
                  : "font-semibold text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {chat.name}
            </h4>

            {/* Right Top: Timestamp formatted like WhatsApp */}
            {chat.lastMessageTime && (
              <span
                className={`text-[12px] shrink-0 font-mono whitespace-nowrap text-right ${
                  hasUnread
                    ? "text-[#F95721] font-semibold"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {formatWhatsAppTime(chat.lastMessageTime)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5 w-full min-w-0">
            {/* Center Bottom: Single-line preview with inline read receipts */}
            <p
              className={`text-[15px] truncate leading-snug flex-1 flex items-center min-w-0 ${
                hasUnread
                  ? "font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {chat.isLastFromMe && (
                <span title="Delivered" className="inline-flex items-center shrink-0 mr-1">
                  <CheckCheck className="w-4 h-4 text-sky-400" />
                </span>
              )}
              <span className="truncate">{chat.lastMessageText}</span>
            </p>

            {/* Right Bottom: Unread badge & Pin icon */}
            <div className="flex items-center gap-1.5 shrink-0">
              {chat.isPinned && (
                <span title="Pinned" className="inline-flex items-center shrink-0">
                  <Pin className="w-3.5 h-3.5 text-zinc-400 rotate-45" />
                </span>
              )}
              {hasUnread && (
                <span className="min-w-[20px] h-5 rounded-full bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center px-1.5 shadow-sm shrink-0">
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hover / long-press Pin toggle button */}
        <button
          type="button"
          onClick={(e) => togglePin(chat.id, e)}
          title={chat.isPinned ? "Unpin chat" : "Pin chat"}
          className={`absolute right-2 top-2 p-1.5 rounded-full text-zinc-400 hover:text-[#F95721] transition opacity-0 group-hover:opacity-100 ${
            chat.isPinned ? "opacity-100" : ""
          }`}
        >
          <Pin
            className={`w-3.5 h-3.5 ${
              chat.isPinned ? "fill-[#F95721] text-[#F95721] rotate-45" : "rotate-45"
            }`}
          />
        </button>

        {/* Subtle row separator indented past avatar */}
        <div className="absolute bottom-0 left-[76px] right-4 h-px bg-black/[0.04] dark:bg-white/[0.04]" />
      </div>
    );
  };

  return (
    <div
      className={`h-full w-full min-w-0 max-w-full flex flex-col bg-white dark:bg-[#111213] border-r border-black/[0.08] dark:border-white/[0.08] overflow-hidden select-none relative ${className}`}
    >
      {/* 1. TOP OF PAGE: Huge bold title: Comms (34px, white, bold) + Top-right + button */}
      <div className="px-4 pt-4 pb-2.5 bg-white dark:bg-[#111213]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[34px] font-bold text-[#111110] dark:text-white tracking-tight leading-none">
            Comms
          </h1>
          <button
            type="button"
            onClick={() => setIsNewDmOpen(true)}
            title="Start new chat"
            className="w-9 h-9 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-[#7F3922]/20 text-zinc-700 dark:text-zinc-200 hover:text-[#F95721] flex items-center justify-center transition active:scale-95"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 2. SEARCH BAR: Full-width rounded pill, gray background, search icon */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/[0.05] dark:bg-[#1C1D1F] border border-black/[0.06] dark:border-white/[0.06] rounded-full pl-9 pr-8 py-2 text-sm text-[#111110] dark:text-white placeholder-zinc-400 focus:outline-none focus:border-[#7F3922]/60 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3. FILTER CHIPS (Horizontal Scroll): All · Unread (N) · Channels · DMs · Pinned */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterTab === "all"
                ? "bg-[#F95721] text-white shadow-sm"
                : "bg-black/[0.05] dark:bg-[#232426] text-zinc-600 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-[#2C2D30]"
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("unread")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterTab === "unread"
                ? "bg-[#F95721] text-white shadow-sm"
                : "bg-black/[0.05] dark:bg-[#232426] text-zinc-600 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-[#2C2D30]"
            }`}
          >
            Unread{totalUnreadCount > 0 ? ` (${totalUnreadCount})` : ""}
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("channels")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterTab === "channels"
                ? "bg-[#F95721] text-white shadow-sm"
                : "bg-black/[0.05] dark:bg-[#232426] text-zinc-600 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-[#2C2D30]"
            }`}
          >
            Channels
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("dms")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterTab === "dms"
                ? "bg-[#F95721] text-white shadow-sm"
                : "bg-black/[0.05] dark:bg-[#232426] text-zinc-600 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-[#2C2D30]"
            }`}
          >
            DMs
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("pinned")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterTab === "pinned"
                ? "bg-[#F95721] text-white shadow-sm"
                : "bg-black/[0.05] dark:bg-[#232426] text-zinc-600 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-[#2C2D30]"
            }`}
          >
            Pinned
          </button>
        </div>
      </div>

      {/* 4. CHAT ROSTER (UNIFIED SCROLLABLE LIST) */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700/30">
        {totalVisible === 0 ? (
          /* EMPTY STATE */
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-zinc-400 mb-3 shadow-inner">
              <MessageSquare className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-[#111110] dark:text-white">
              No conversations yet
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mt-1 leading-relaxed">
              {searchQuery
                ? `No chats matched "${searchQuery}".`
                : filterTab === "unread"
                ? "You're all caught up! No unread messages."
                : filterTab === "pinned"
                ? "You haven't pinned any chats yet."
                : "Start a conversation with a teammate or browse team channels."}
            </p>
            <button
              type="button"
              onClick={() => setIsNewDmOpen(true)}
              className="mt-4 px-5 py-2 rounded-full bg-[#F95721] hover:bg-[#E04815] text-white text-xs font-semibold shadow-md active:scale-95 transition"
            >
              Start a chat
            </button>
          </div>
        ) : (
          <div className="pb-16 lg:pb-4">
            {/* PINNED CHATS SECTION AT TOP */}
            {pinnedChats.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 bg-black/[0.02] dark:bg-white/[0.02]">
                  <Pin className="w-3 h-3 text-[#F95721] rotate-45" />
                  <span>Pinned</span>
                </div>
                {pinnedChats.map((chat) => renderChatRow(chat))}
              </div>
            )}

            {/* UNPINNED CHATS */}
            {unpinnedChats.length > 0 && (
              <div>
                {pinnedChats.length > 0 && (
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400 bg-black/[0.02] dark:bg-white/[0.02]">
                    All Chats
                  </div>
                )}
                {unpinnedChats.map((chat) => renderChatRow(chat))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. NEW CHAT FLOATING ACTION BUTTON (MOBILE ONLY) */}
      <button
        type="button"
        onClick={() => setIsNewDmOpen(true)}
        title="Start new chat"
        className="fixed bottom-20 right-4 lg:hidden z-30 w-14 h-14 rounded-full bg-[#F95721] hover:bg-[#E04815] text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
      >
        <MessageSquarePlus className="w-6 h-6 stroke-[2.2]" />
      </button>

      {/* 6. START NEW CHAT BOTTOM SHEET / MODAL */}
      {isNewDmOpen && (
        <div
          role="dialog"
          aria-label="Start New Chat"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end lg:justify-center lg:items-center p-0 lg:p-4 animate-in fade-in duration-200"
          onClick={() => setIsNewDmOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#141516] border-t lg:border border-black/[0.1] dark:border-white/[0.12] rounded-t-3xl lg:rounded-3xl p-5 shadow-2xl space-y-4 max-w-lg w-full mx-auto animate-in slide-in-from-bottom duration-250 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-bold text-[#111110] dark:text-white">
                  Start New Chat
                </h3>
                <p className="text-xs text-zinc-500">
                  Select a team member to start a direct message
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewDmOpen(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-96">
              {filteredTeamMembers.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400">
                  No team members found.
                </div>
              ) : (
                filteredTeamMembers.map((member) => {
                  const isOnline = onlineUsers.has(member.id);
                  const avatarColor = getAvatarColor(member.id);

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        onSelectDm(member);
                        setIsNewDmOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition group text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${avatarColor}`}
                          >
                            {(member.full_name || "U")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#141516]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate block">
                            {member.full_name}
                          </span>
                          <span className="text-[11px] text-zinc-400 capitalize">
                            {member.role || "Operator"}
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-semibold text-[#F95721] opacity-0 group-hover:opacity-100 transition">
                        Chat →
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
