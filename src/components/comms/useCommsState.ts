"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  last_message?: {
    body: string;
    sender_name?: string;
    created_at: string;
  } | null;
  unread_count?: number;
}

export interface PublicProfile {
  id: string;
  full_name: string;
  role: string;
}

export interface MessageAttachment {
  type: "image" | "file";
  url: string;
  name: string;
  size?: string;
}

export interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  channel_id?: string;
  thread_id?: string;
  read_at?: string | null;
  parent_message_id?: string | null;
  reply_to?: {
    id: string;
    sender_name: string;
    body: string;
  } | null;
  attachments?: MessageAttachment[];
  profiles?: {
    full_name: string;
    role: string;
  };
}

export interface DMConversation {
  id: string; // thread_id
  participant: PublicProfile;
  last_message: {
    id: string;
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  unread_count: number;
  updated_at: string;
}

export function useCommsState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // Core state
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserProfile, setCurrentUserProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Channels & DM Conversations
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [teamMembers, setTeamMembers] = useState<PublicProfile[]>([]);

  // Navigation / Selection
  const [activeView, setActiveView] = useState<"channel" | "dm">("channel");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmUser, setActiveDmUser] = useState<PublicProfile | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Messages and In-memory Caches
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const messagesCacheRef = useRef<Record<string, Message[] | undefined>>({});
  const profileCacheRef = useRef<Record<string, PublicProfile | undefined>>({});

  // Presence & Typing
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingMap, setTypingMap] = useState<Record<string, { full_name: string; until: number }>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingBroadcastChannelRef = useRef<any>(null);

  // Active target tracker to avoid stale async state transitions
  const activeTargetRef = useRef<string>("");
  const initialSyncDoneRef = useRef<boolean>(false);
  const inFlightProfilesRef = useRef<Record<string, Promise<PublicProfile> | undefined>>({});

  // Profile resolution with cache & in-flight deduplication
  const resolveProfile = useCallback(
    async (userId: string): Promise<PublicProfile> => {
      if (profileCacheRef.current[userId]) {
        return profileCacheRef.current[userId];
      }
      if (inFlightProfilesRef.current[userId]) {
        return inFlightProfilesRef.current[userId];
      }

      const fetchPromise = (async () => {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", userId)
            .maybeSingle();

          if (data) {
            profileCacheRef.current[userId] = data;
            return data;
          }
        } catch (e) {
          console.warn("Failed to resolve profile for:", userId, e);
        } finally {
          delete inFlightProfilesRef.current[userId];
        }
        const fallback: PublicProfile = { id: userId, full_name: "Team Member", role: "caller" };
        profileCacheRef.current[userId] = fallback;
        return fallback;
      })();

      inFlightProfilesRef.current[userId] = fetchPromise;
      return fetchPromise;
    },
    [supabase]
  );

  // 1. Fetch Conversations from API
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      if (res.ok) {
        const data = await res.json();
        const convList: DMConversation[] = data.conversations || [];
        setConversations(convList);
        // Pre-populate profile cache with participants
        convList.forEach((c) => {
          if (c.participant) {
            profileCacheRef.current[c.participant.id] = c.participant;
          }
        });
      }
    } catch (err) {
      console.warn("Error refreshing conversations:", err);
    }
  }, []);

  // 2. Initial Setup: Auth, Profiles, Channels, Conversations
  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      try {
        // Resolve current authenticated user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && mounted) {
          setCurrentUserId(user.id);
          const { data: myProfile } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", user.id)
            .maybeSingle();

          if (myProfile && mounted) {
            setCurrentUserProfile(myProfile);
            profileCacheRef.current[user.id] = myProfile;
          }
        }

        // Fetch team members
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("id, full_name, role")
          .order("full_name", { ascending: true });

        if (profiles && mounted) {
          profiles.forEach((p) => {
            profileCacheRef.current[p.id] = p;
          });
          setTeamMembers(user ? profiles.filter((p) => p.id !== user.id) : profiles);
        }

        // Fetch channels
        const { data: channelData } = await supabase
          .from("channels")
          .select("*")
          .order("name", { ascending: true });

        const resolvedChannels: Channel[] = (channelData || []).map((c: any) => ({
          ...c,
          unread_count: 0,
          last_message: null,
        }));

        // Fetch latest message for each channel
        if (resolvedChannels.length > 0) {
          const channelIds = resolvedChannels.map((c) => c.id);
          const { data: recentMsgs } = await supabase
            .from("messages")
            .select(`
              channel_id,
              body,
              created_at,
              sender_id,
              profiles:sender_id (full_name)
            `)
            .in("channel_id", channelIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

          if (recentMsgs && recentMsgs.length > 0) {
            const latestMap: Record<string, any> = {};
            recentMsgs.forEach((m: any) => {
              if (!latestMap[m.channel_id]) {
                latestMap[m.channel_id] = {
                  body: m.body,
                  sender_name: m.profiles?.full_name || "Teammate",
                  created_at: m.created_at,
                };
              }
            });
            resolvedChannels.forEach((c) => {
              c.last_message = latestMap[c.id] || null;
            });
          }
        }

        if (mounted) {
          setChannels(resolvedChannels);
        }

        // Fetch DM Conversations
        await refreshConversations();
      } catch (err) {
        console.error("Failed to initialize comms state:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [supabase, refreshConversations]);

  // 3. Selection Handlers
  const selectChannel = useCallback((channelId: string) => {
    const targetKey = `ch_${channelId}`;
    activeTargetRef.current = targetKey;
    setActiveView("channel");
    setActiveChannelId(channelId);
    setActiveDmUser(null);
    setActiveThreadId(null);
    setReplyingToMessage(null);

    // Reset unread count on selected channel
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, unread_count: 0 } : c))
    );

    // Update URL query parameter cleanly without reload
    const url = new URL(window.location.href);
    url.searchParams.set("channel", channelId);
    url.searchParams.delete("dm");
    window.history.replaceState({}, "", url.toString());

    if (messagesCacheRef.current[targetKey]) {
      setMessages(messagesCacheRef.current[targetKey]);
      setIsMessagesLoading(false);
    } else {
      setMessages([]);
      setIsMessagesLoading(true);
    }
  }, []);

  const selectDm = useCallback(
    async (member: PublicProfile) => {
      setActiveView("dm");
      setActiveDmUser(member);
      setActiveChannelId(null);

      // Update URL query parameter
      const url = new URL(window.location.href);
      url.searchParams.set("dm", member.id);
      url.searchParams.delete("channel");
      window.history.replaceState({}, "", url.toString());

      setMessages([]);
      setIsMessagesLoading(true);

      try {
        if (!currentUserId) {
          setIsMessagesLoading(false);
          return;
        }
        const res = await fetch("/api/messages/thread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_1: currentUserId, user_2: member.id }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to resolve DM thread");
        }

        const { thread_id } = await res.json();
        setActiveThreadId(thread_id);

        const targetKey = `dm_${thread_id}`;
        activeTargetRef.current = targetKey;

        // Mark thread messages as read
        fetch("/api/messages/conversations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id }),
        }).catch(() => {});

        // Clear local unread badge on conversation
        setConversations((prev) =>
          prev.map((c) => (c.id === thread_id ? { ...c, unread_count: 0 } : c))
        );

        if (messagesCacheRef.current[targetKey]) {
          setMessages(messagesCacheRef.current[targetKey]);
          setIsMessagesLoading(false);
        }
      } catch (err) {
        console.error("Error setting up DM thread:", err);
        setIsMessagesLoading(false);
      }
    },
    [currentUserId]
  );

  // 4. Handle Deep-linking on Initial Load (Runs once on mount when ready)
  useEffect(() => {
    if (loading || !currentUserId || channels.length === 0) return;
    if (initialSyncDoneRef.current) return;
    initialSyncDoneRef.current = true;

    const dmParam = searchParams.get("dm");
    const channelParam = searchParams.get("channel");

    if (dmParam) {
      const targetUser =
        profileCacheRef.current[dmParam] ||
        teamMembers.find((m) => m.id === dmParam);

      if (targetUser) {
        selectDm(targetUser);
        return;
      } else {
        resolveProfile(dmParam).then((prof) => {
          if (prof && prof.id === dmParam) {
            selectDm(prof);
          }
        });
        return;
      }
    }

    if (channelParam) {
      const targetCh = channels.find((c) => c.id === channelParam || c.name === channelParam);
      if (targetCh) {
        selectChannel(targetCh.id);
        return;
      }
    }

    // Default fallback: select first channel if neither channel nor DM is selected
    if (channels.length > 0) {
      selectChannel(channels[0].id);
    }
  }, [loading, currentUserId, searchParams, channels, teamMembers, selectDm, selectChannel, resolveProfile]);

  // 5. Active Channel Feed: Fetch messages & subscribe to changes
  useEffect(() => {
    if (activeView !== "channel" || !activeChannelId) return;

    const currentTarget = `ch_${activeChannelId}`;
    activeTargetRef.current = currentTarget;

    let isCancelled = false;

    // Load channel messages
    async function loadChannelMessages() {
      try {
        const res = await fetch(`/api/messages?channel_id=${activeChannelId}`);
        if (res.ok) {
          const data = await res.json();
          const fetched: Message[] = data.messages || [];

          messagesCacheRef.current[currentTarget] = fetched;
          if (!isCancelled && activeTargetRef.current === currentTarget) {
            setMessages(fetched);
            setIsMessagesLoading(false);
          }
        } else {
          if (!isCancelled && activeTargetRef.current === currentTarget) {
            setMessages([]);
            setIsMessagesLoading(false);
          }
        }
      } catch (e) {
        console.warn("Error fetching channel messages:", e);
        if (!isCancelled && activeTargetRef.current === currentTarget) {
          setMessages([]);
          setIsMessagesLoading(false);
        }
      }

      // Record channel read
      if (currentUserId && !isCancelled) {
        try {
          await supabase.from("channel_reads").upsert({
            channel_id: activeChannelId,
            user_id: currentUserId,
            last_read_at: new Date().toISOString(),
          });
        } catch {
          // Ignore read timestamp error
        }
      }
    }

    loadChannelMessages();

    // Subscribe to channel messages Realtime
    const channelSub = supabase
      .channel(`channel-realtime-${activeChannelId}-${Math.random().toString(36).substring(2, 9)}`)
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
            const sender = await resolveProfile(newRow.sender_id);
            const fullMsg: Message = {
              ...newRow,
              profiles: sender,
            };

            messagesCacheRef.current[currentTarget] = [
              ...(messagesCacheRef.current[currentTarget] || []).filter((m) => m.id !== newRow.id),
              fullMsg,
            ];

            if (activeTargetRef.current === currentTarget) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newRow.id)) return prev;
                return [...prev, fullMsg];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedRow = payload.new as any;
            messagesCacheRef.current[currentTarget] = (
              messagesCacheRef.current[currentTarget] || []
            )
              .filter((m) => (updatedRow.deleted_at ? m.id !== updatedRow.id : true))
              .map((m) => (m.id === updatedRow.id ? { ...m, ...updatedRow } : m));

            if (activeTargetRef.current === currentTarget) {
              if (updatedRow.deleted_at) {
                setMessages((prev) => prev.filter((m) => m.id !== updatedRow.id));
              } else {
                setMessages((prev) =>
                  prev.map((m) => (m.id === updatedRow.id ? { ...m, ...updatedRow } : m))
                );
              }
            }
          } else if (payload.eventType === "DELETE") {
            const deletedRow = payload.old as any;
            messagesCacheRef.current[currentTarget] = (
              messagesCacheRef.current[currentTarget] || []
            ).filter((m) => m.id !== deletedRow.id);

            if (activeTargetRef.current === currentTarget) {
              setMessages((prev) => prev.filter((m) => m.id !== deletedRow.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(channelSub);
    };
  }, [activeView, activeChannelId, currentUserId, supabase, resolveProfile]);

  // 6. Active DM Feed: Fetch messages & subscribe to changes
  useEffect(() => {
    if (activeView !== "dm" || !activeThreadId) return;

    const currentTarget = `dm_${activeThreadId}`;
    activeTargetRef.current = currentTarget;

    let isCancelled = false;

    async function loadDmMessages() {
      try {
        const res = await fetch(`/api/messages?thread_id=${activeThreadId}`);
        if (res.ok) {
          const data = await res.json();
          const fetched: Message[] = data.messages || [];

          messagesCacheRef.current[currentTarget] = fetched;
          if (!isCancelled && activeTargetRef.current === currentTarget) {
            setMessages(fetched);
            setIsMessagesLoading(false);
          }
        } else {
          if (!isCancelled && activeTargetRef.current === currentTarget) {
            setMessages([]);
            setIsMessagesLoading(false);
          }
        }
      } catch (e) {
        console.warn("Error fetching DM messages:", e);
        if (!isCancelled && activeTargetRef.current === currentTarget) {
          setMessages([]);
          setIsMessagesLoading(false);
        }
      }
    }

    loadDmMessages();

    const dmSub = supabase
      .channel(`dm-realtime-${activeThreadId}-${Math.random().toString(36).substring(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as any;
            const sender = await resolveProfile(newRow.sender_id);
            const fullMsg: Message = {
              ...newRow,
              profiles: sender,
            };

            messagesCacheRef.current[currentTarget] = [
              ...(messagesCacheRef.current[currentTarget] || []).filter((m) => m.id !== newRow.id),
              fullMsg,
            ];

            if (activeTargetRef.current === currentTarget) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newRow.id)) return prev;
                return [...prev, fullMsg];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedRow = payload.new as any;
            messagesCacheRef.current[currentTarget] = (
              messagesCacheRef.current[currentTarget] || []
            )
              .filter((m) => (updatedRow.deleted_at ? m.id !== updatedRow.id : true))
              .map((m) => (m.id === updatedRow.id ? { ...m, ...updatedRow } : m));

            if (activeTargetRef.current === currentTarget) {
              if (updatedRow.deleted_at) {
                setMessages((prev) => prev.filter((m) => m.id !== updatedRow.id));
              } else {
                setMessages((prev) =>
                  prev.map((m) => (m.id === updatedRow.id ? { ...m, ...updatedRow } : m))
                );
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(dmSub);
    };
  }, [activeView, activeThreadId, supabase, resolveProfile]);

  // 7. Global DM Inbox Listener: Updates unread counts & snippets for incoming DMs
  useEffect(() => {
    if (!currentUserId) return;

    const globalDmSub = supabase
      .channel(`global-dm-inbox-${currentUserId}-${Math.random().toString(36).substring(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_messages",
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            refreshConversations();
            return;
          }

          const newMsg = (payload.new || {}) as any;
          if (!newMsg.thread_id) return;

          const isOwnMessage = newMsg.sender_id === currentUserId;

          // Check if message belongs to an active or cached thread
          setConversations((prev) => {
            const matchIndex = prev.findIndex((c) => c.id === newMsg.thread_id);
            if (matchIndex >= 0) {
              const updated = [...prev];
              const conv = updated[matchIndex];
              const isViewingThisThread =
                activeTargetRef.current === `dm_${newMsg.thread_id}`;

              const nextUnread =
                isViewingThisThread || isOwnMessage
                  ? conv.unread_count
                  : conv.unread_count + 1;

              updated[matchIndex] = {
                ...conv,
                last_message: {
                  id: newMsg.id,
                  body: newMsg.body,
                  sender_id: newMsg.sender_id,
                  created_at: newMsg.created_at,
                },
                unread_count: nextUnread,
                updated_at: newMsg.created_at || conv.updated_at,
              };

              // Re-sort with newest on top
              return updated.sort(
                (a, b) =>
                  new Date(b.updated_at || 0).getTime() -
                  new Date(a.updated_at || 0).getTime()
              );
            } else {
              // New conversation not yet in list — trigger refresh
              refreshConversations();
              return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalDmSub);
    };
  }, [currentUserId, supabase, refreshConversations]);

  // 7b. Global Channel Messages Listener: Updates unread counts & snippets for channels
  useEffect(() => {
    if (!currentUserId) return;

    const globalChannelSub = supabase
      .channel(`global-channel-inbox-${Math.random().toString(36).substring(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg.channel_id) return;

          const sender = await resolveProfile(newMsg.sender_id);
          const isViewingThisChannel =
            activeTargetRef.current === `ch_${newMsg.channel_id}`;

          setChannels((prev) =>
            prev.map((c) => {
              if (c.id === newMsg.channel_id) {
                return {
                  ...c,
                  last_message: {
                    body: newMsg.body,
                    sender_name: sender.full_name,
                    created_at: newMsg.created_at,
                  },
                  unread_count: isViewingThisChannel
                    ? 0
                    : (c.unread_count || 0) + 1,
                };
              }
              return c;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalChannelSub);
    };
  }, [currentUserId, supabase, resolveProfile]);

  // 8. Presence & Online Status Channel
  useEffect(() => {
    if (!currentUserId) return;

    const presenceChannel = supabase.channel("comms-presence", {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          onlineIds.add(key);
        });
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUserId, supabase]);

  // 9. Realtime Typing Indicator Channel
  useEffect(() => {
    const typingChannel = supabase.channel("comms-typing");
    typingBroadcastChannelRef.current = typingChannel;

    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id, full_name, target_id } = payload.payload || {};
        if (user_id === currentUserId) return;

        const currentActiveKey =
          activeView === "channel" ? activeChannelId : activeThreadId;

        if (target_id && target_id === currentActiveKey) {
          setTypingMap((prev) => ({
            ...prev,
            [user_id]: {
              full_name: full_name || "Someone",
              until: Date.now() + 2500,
            },
          }));
        }
      })
      .subscribe();

    // Cleanup stale typing indicators every second
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        let changed = false;
        const next: Record<string, { full_name: string; until: number }> = {};
        Object.entries(prev).forEach(([id, item]) => {
          if (item.until > now) {
            next[id] = item;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(typingChannel);
    };
  }, [currentUserId, activeView, activeChannelId, activeThreadId, supabase]);

  // Broadcast typing event with debounce
  const broadcastTyping = useCallback(() => {
    if (!typingBroadcastChannelRef.current || !currentUserProfile) return;
    if (typingTimeoutRef.current) return; // Debounce broadcast rate

    const target_id = activeView === "channel" ? activeChannelId : activeThreadId;
    if (!target_id) return;

    typingBroadcastChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: currentUserId,
        full_name: currentUserProfile.full_name,
        target_id,
      },
    });

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [currentUserProfile, activeView, activeChannelId, activeThreadId, currentUserId]);

  // 10. Send Message
  const sendMessage = useCallback(
    async (text: string, replyTo?: Message | null, attachments?: MessageAttachment[]) => {
      const hasAttachments = attachments && attachments.length > 0;
      if ((!text.trim() && !hasAttachments) || !currentUserId) return;

      const targetKey =
        activeView === "channel" ? `ch_${activeChannelId}` : `dm_${activeThreadId}`;

      const replyTarget = replyTo || replyingToMessage;

      try {
        const payload: any = {
          body: text.trim() || (hasAttachments ? (attachments![0].type === "image" ? "📷 Image" : "📎 Attachment") : ""),
          sender_id: currentUserId,
          is_dm: activeView === "dm",
          parent_message_id: replyTarget ? replyTarget.id : null,
          attachments: attachments || [],
        };

        if (activeView === "channel") {
          payload.channel_id = activeChannelId;
        } else {
          payload.thread_id = activeThreadId;
        }

        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }

        const { message } = await res.json();
        if (message) {
          if (replyTarget) {
            message.reply_to = {
              id: replyTarget.id,
              sender_name: replyTarget.profiles?.full_name || "Teammate",
              body: replyTarget.body,
            };
          }

          // Update cache & messages state
          messagesCacheRef.current[targetKey] = [
            ...(messagesCacheRef.current[targetKey] || []).filter((m) => m.id !== message.id),
            message,
          ];

          if (activeTargetRef.current === targetKey) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === message.id)) return prev;
              return [...prev, message];
            });
          }

          // Reset reply banner
          setReplyingToMessage(null);

          // Update channel list snippet if in channel
          if (activeView === "channel" && activeChannelId) {
            setChannels((prev) =>
              prev.map((c) =>
                c.id === activeChannelId
                  ? {
                      ...c,
                      last_message: {
                        body: message.body,
                        sender_name: currentUserProfile?.full_name || "You",
                        created_at: message.created_at,
                      },
                    }
                  : c
              )
            );
          }

          // Update conversation list if it's a DM
          if (activeView === "dm" && activeThreadId) {
            setConversations((prev) => {
              const matchIndex = prev.findIndex((c) => c.id === activeThreadId);
              if (matchIndex >= 0) {
                const updated = [...prev];
                updated[matchIndex] = {
                  ...updated[matchIndex],
                  last_message: {
                    id: message.id,
                    body: message.body,
                    sender_id: message.sender_id,
                    created_at: message.created_at,
                  },
                  updated_at: message.created_at,
                };
                return updated.sort(
                  (a, b) =>
                    new Date(b.updated_at || 0).getTime() -
                    new Date(a.updated_at || 0).getTime()
                );
              } else {
                const newConv: DMConversation = {
                  id: activeThreadId,
                  participant: activeDmUser || {
                    id: "",
                    full_name: "Teammate",
                    role: "caller",
                  },
                  last_message: {
                    id: message.id,
                    body: message.body,
                    sender_id: message.sender_id,
                    created_at: message.created_at,
                  },
                  unread_count: 0,
                  updated_at: message.created_at,
                };
                refreshConversations();
                return [newConv, ...prev];
              }
            });
          }
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        throw err;
      }
    },
    [activeView, activeChannelId, activeThreadId, activeDmUser, currentUserId, currentUserProfile, replyingToMessage, refreshConversations]
  );

  // 11. Edit Message
  const editMessage = useCallback(
    async (messageId: string, newBody: string) => {
      if (!newBody.trim()) return;

      try {
        const res = await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: messageId,
            body: newBody.trim(),
            is_dm: activeView === "dm",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to edit message");
        }

        const targetKey =
          activeView === "channel" ? `ch_${activeChannelId}` : `dm_${activeThreadId}`;

        const updatedDate = new Date().toISOString();

        messagesCacheRef.current[targetKey] = (
          messagesCacheRef.current[targetKey] || []
        ).map((m) => (m.id === messageId ? { ...m, body: newBody, edited_at: updatedDate } : m));

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, body: newBody, edited_at: updatedDate } : m))
        );
      } catch (err) {
        console.error("Failed to edit message:", err);
        throw err;
      }
    },
    [activeView, activeChannelId, activeThreadId]
  );

  // 12. Delete Message
  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch("/api/messages", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: messageId,
            is_dm: activeView === "dm",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to delete message");
        }

        const targetKey =
          activeView === "channel" ? `ch_${activeChannelId}` : `dm_${activeThreadId}`;

        messagesCacheRef.current[targetKey] = (
          messagesCacheRef.current[targetKey] || []
        ).filter((m) => m.id !== messageId);

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        console.error("Failed to delete message:", err);
        throw err;
      }
    },
    [activeView, activeChannelId, activeThreadId]
  );

  // Extract currently active channel object
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  // Active typing list (names of other users)
  const typingUserNames = Object.values(typingMap).map((t) => t.full_name);

  return {
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
    selectChannel,
    selectDm,
    sendMessage,
    editMessage,
    deleteMessage,
    broadcastTyping,
    refreshConversations,
    replyingToMessage,
    setReplyingToMessage,
  };
}
