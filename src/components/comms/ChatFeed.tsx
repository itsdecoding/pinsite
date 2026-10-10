"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  ArrowLeft,
  Hash,
  Lock,
  Users,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Channel, PublicProfile, Message, MessageAttachment } from "./useCommsState";
import { MessageItem } from "./MessageItem";
import { MessageComposer } from "./MessageComposer";

interface ChatFeedProps {
  activeView: "channel" | "dm";
  activeChannel: Channel | null;
  activeDmUser: PublicProfile | null;
  messages: Message[];
  isLoading: boolean;
  currentUserId: string;
  currentUserRole?: string;
  onlineUsers: Set<string>;
  totalTeamCount?: number;
  teamMembers?: PublicProfile[];
  typingUserNames: string[];
  replyingToMessage: Message | null;
  onSetReplyingToMessage: (msg: Message | null) => void;
  onBack?: () => void;
  onSendMessage: (
    text: string,
    replyTo?: Message | null,
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  onEditMessage: (messageId: string, newBody: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onTyping: () => void;
  className?: string;
}

export function ChatFeed({
  activeView,
  activeChannel,
  activeDmUser,
  messages,
  isLoading,
  currentUserId,
  currentUserRole = "caller",
  onlineUsers,
  totalTeamCount = 5,
  teamMembers = [],
  typingUserNames,
  replyingToMessage,
  onSetReplyingToMessage,
  onBack,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onTyping,
  className = "",
}: ChatFeedProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);

  // Auto-scroll to bottom when messages change if user is near bottom
  useEffect(() => {
    if (messagesEndRef.current && !showScrollBottomPill) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showScrollBottomPill]);

  // Handle scroll to detect if scrolled up
  const handleScroll = () => {
    if (!scrollAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollBottomPill(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBottomPill(false);
  };

  // Group messages by calendar date ("Today", "Yesterday", or MMMM D, YYYY)
  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; items: Message[] }[] = [];
    const dateMap = new Map<string, Message[]>();

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at);
      const now = new Date();

      const isToday =
        msgDate.getDate() === now.getDate() &&
        msgDate.getMonth() === now.getMonth() &&
        msgDate.getFullYear() === now.getFullYear();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        msgDate.getDate() === yesterday.getDate() &&
        msgDate.getMonth() === yesterday.getMonth() &&
        msgDate.getFullYear() === yesterday.getFullYear();

      let label = msgDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      if (isToday) label = "Today";
      else if (isYesterday) label = "Yesterday";

      if (!dateMap.has(label)) {
        dateMap.set(label, []);
      }
      dateMap.get(label)!.push(msg);
    });

    dateMap.forEach((items, dateLabel) => {
      groups.push({ dateLabel, items });
    });

    return groups;
  }, [messages]);

  const isDmOnline = activeDmUser ? onlineUsers.has(activeDmUser.id) : false;
  const isTyping = typingUserNames.length > 0;
  const typingStatusText = isTyping
    ? activeView === "dm"
      ? "typing..."
      : `${typingUserNames.join(", ")} is typing...`
    : null;

  const onlineCount = onlineUsers.size;

  return (
    <div
      className={`h-full flex flex-col bg-[#F7F5F0] dark:bg-[#0B0C0D] border-x border-black/[0.08] dark:border-white/[0.08] overflow-hidden select-none relative ${className}`}
    >
      {/* WhatsApp Header: Clean, quiet, no fake badges */}
      <div className="px-3.5 py-2.5 sm:py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 bg-white/70 dark:bg-[#141516] backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobile Back Button */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title="Back to chats"
              className="lg:hidden p-1.5 -ml-1 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-[#F95721] transition active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {activeView === "channel" ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#7F3922]/15 border border-[#7F3922]/30 flex items-center justify-center text-[#F95721] shrink-0">
                {activeChannel?.is_private ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Hash className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#111110] dark:text-white truncate leading-tight">
                  #{activeChannel?.name || "channel"}
                </h3>
                <p className="text-[11px] truncate leading-tight mt-0.5">
                  {isTyping ? (
                    <span className="text-[#F95721] font-medium animate-pulse">
                      {typingStatusText}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {onlineCount} of {totalTeamCount} online
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center text-xs font-bold shadow-sm">
                  {(activeDmUser?.full_name || "U").charAt(0).toUpperCase()}
                </div>
                {isDmOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#141516]" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#111110] dark:text-white truncate leading-tight">
                  {activeDmUser?.full_name || "Direct Message"}
                </h3>
                <p className="text-[11px] truncate leading-tight mt-0.5">
                  {isTyping ? (
                    <span className="text-[#F95721] font-medium animate-pulse">
                      typing...
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {isDmOnline ? "online" : "offline"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Message Stream Area (Flat background, floating bubbles, consecutive grouping) */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700/30"
      >
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-12 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#F95721]" />
            <span className="text-xs">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-12 text-center text-zinc-400">
            <div className="w-10 h-10 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-zinc-400">
              <Users className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {activeView === "channel"
                ? `Welcome to #${activeChannel?.name || "this channel"}!`
                : `Conversation with ${activeDmUser?.full_name || "teammate"}`}
            </p>
            <p className="text-[11px] text-zinc-500 max-w-xs">
              Send a message to start the conversation.
            </p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.dateLabel} className="space-y-1">
              {/* WhatsApp Date Divider Pill */}
              <div className="flex items-center justify-center my-3 select-none">
                <span className="px-2.5 py-0.5 rounded-lg bg-black/[0.06] dark:bg-[#1E1F20] text-zinc-600 dark:text-zinc-400 text-[10px] font-semibold uppercase tracking-wider shadow-sm">
                  {group.dateLabel}
                </span>
              </div>

              {/* Message List with Consecutive Grouping */}
              {group.items.map((msg, index) => {
                const isCurrent = msg.sender_id === currentUserId;
                const prevMsg = group.items[index - 1];

                const isSameSenderAsPrev =
                  prevMsg &&
                  prevMsg.sender_id === msg.sender_id &&
                  new Date(msg.created_at).getTime() -
                    new Date(prevMsg.created_at).getTime() <
                    5 * 60 * 1000;

                const showSenderHeader = !isSameSenderAsPrev;

                const quoted = msg.parent_message_id
                  ? messages.find((m) => m.id === msg.parent_message_id) || null
                  : null;

                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isCurrentUser={isCurrent}
                    canManage={isCurrent || currentUserRole === "admin"}
                    showSenderHeader={showSenderHeader}
                    isChannel={activeView === "channel"}
                    onEdit={onEditMessage}
                    onDelete={onDeleteMessage}
                    onReply={(m) => onSetReplyingToMessage(m)}
                    quotedMessage={quoted}
                  />
                );
              })}
            </div>
          ))
        )}

        {/* Typing indicator bubble at bottom */}
        {isTyping && (
          <div className="flex items-center gap-2 max-w-fit px-3 py-1.5 rounded-2xl bg-zinc-200 dark:bg-[#1E1F20] text-xs text-zinc-500 dark:text-zinc-400 animate-in fade-in duration-150">
            <span className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F95721] animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#F95721] animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#F95721] animate-bounce [animation-delay:0.4s]" />
            </span>
            <span className="italic text-[11px] text-[#F95721]">
              {typingStatusText}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Jump to Latest Floating Pill */}
      {showScrollBottomPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 right-6 p-2 rounded-full bg-[#7F3922] hover:bg-[#F95721] text-white shadow-lg transition active:scale-95 flex items-center justify-center z-20"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* WhatsApp Message Composer */}
      <MessageComposer
        onSendMessage={onSendMessage}
        onTyping={onTyping}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => onSetReplyingToMessage(null)}
        teamMembers={teamMembers}
        placeholder={
          activeChannel?.is_private &&
          currentUserRole !== "admin" &&
          currentUserRole !== "manager"
            ? "Restricted management channel (read-only)"
            : activeView === "channel"
            ? `Message #${activeChannel?.name || "channel"}`
            : `Message ${activeDmUser?.full_name || "teammate"}`
        }
        disabled={
          activeChannel?.is_private &&
          currentUserRole !== "admin" &&
          currentUserRole !== "manager"
        }
      />
    </div>
  );
}
