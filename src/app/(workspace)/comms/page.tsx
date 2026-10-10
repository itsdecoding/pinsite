"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCommsState, PublicProfile } from "@/components/comms/useCommsState";
import { CommsDirectory } from "@/components/comms/CommsDirectory";
import { ChatFeed } from "@/components/comms/ChatFeed";

function CommsHubContainer() {
  const searchParams = useSearchParams();
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const {
    currentUserId,
    currentUserProfile,
    loading,
    channels,
    conversations,
    teamMembers,
    activeView,
    activeChannelId,
    activeChannel,
    activeDmUser,
    activeThreadId,
    messages,
    isMessagesLoading,
    onlineUsers,
    typingUserNames,
    replyingToMessage,
    setReplyingToMessage,
    selectChannel,
    selectDm,
    sendMessage,
    editMessage,
    deleteMessage,
    broadcastTyping,
  } = useCommsState();

  // If a deep-link is present on mount, jump directly to chat view on mobile
  useEffect(() => {
    if (searchParams.get("dm") || searchParams.get("channel")) {
      setMobileView("chat");
    }
  }, [searchParams]);

  const handleSelectChannel = (channelId: string) => {
    selectChannel(channelId);
    setMobileView("chat");
  };

  const handleSelectDm = (member: PublicProfile) => {
    selectDm(member);
    setMobileView("chat");
  };

  const handleBack = () => {
    setMobileView("list");
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-5rem)] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#F95721]" />
        <span className="text-xs text-zinc-500 font-medium">
          Loading Comms Command Center...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100dvh-5rem)] lg:h-[calc(100dvh-6.5rem)] max-h-[920px] flex rounded-2xl md:rounded-3xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden shadow-2xl bg-white dark:bg-[#111213] pb-[env(safe-area-inset-bottom,0.5rem)]">
      {/* 1. DIRECTORY RAIL:
          On Desktop: Always visible (w-72 or w-80).
          On Mobile (< lg): Visible only when mobileView === 'list' */}
      <div
        className={`h-full w-full lg:w-72 xl:w-80 shrink-0 ${
          mobileView === "list" ? "block" : "hidden lg:block"
        }`}
      >
        <CommsDirectory
          channels={channels}
          conversations={conversations}
          teamMembers={teamMembers}
          activeView={activeView}
          activeChannelId={activeChannelId}
          activeDmUser={activeDmUser}
          onlineUsers={onlineUsers}
          onSelectChannel={handleSelectChannel}
          onSelectDm={handleSelectDm}
        />
      </div>

      {/* 2. ACTIVE CHAT FEED:
          On Desktop: Always visible (flex-1).
          On Mobile (< lg): Visible only when mobileView === 'chat' */}
      <div
        className={`h-full flex-1 min-w-0 ${
          mobileView === "chat" ? "block" : "hidden lg:block"
        }`}
      >
        <ChatFeed
          activeView={activeView}
          activeChannel={activeChannel}
          activeDmUser={activeDmUser}
          messages={messages}
          isLoading={isMessagesLoading}
          currentUserId={currentUserId}
          currentUserRole={currentUserProfile?.role || "caller"}
          onlineUsers={onlineUsers}
          totalTeamCount={teamMembers.length + 1}
          teamMembers={teamMembers}
          typingUserNames={typingUserNames}
          replyingToMessage={replyingToMessage}
          onSetReplyingToMessage={setReplyingToMessage}
          onBack={handleBack}
          onSendMessage={sendMessage}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onTyping={broadcastTyping}
        />
      </div>
    </div>
  );
}

export default function CommsHubPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100dvh-6rem)] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#F95721]" />
          <span className="text-xs text-zinc-500 font-medium">
            Initializing Comms...
          </span>
        </div>
      }
    >
      <CommsHubContainer />
    </Suspense>
  );
}
