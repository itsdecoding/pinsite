"use client";

import React, { useEffect, useState, useRef } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const { user } = useUserSession();

  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;

    // Fetch initial notifications
    async function loadNotifications() {
      try {
        const { data } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (data && isMounted) {
          setNotifications(data);
          setUnreadCount(data.filter((n) => !n.read_at).length);
        }
      } catch (e) {
        console.warn("Failed to load initial notifications:", e);
      }
    }

    loadNotifications();

    // Unique topic per mount prevents reusing already-subscribed channels across React StrictMode cycles
    const channelTopic = `user-notifs-${user.id}-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!isMounted) return;
          const newNotif = payload.new as NotificationItem;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnreadCount(0);
  }

  async function markAsRead(id: string) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
        aria-label="View notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F95721] px-1 text-[10px] font-bold text-white shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 lg:left-full lg:right-auto lg:ml-2 bottom-full lg:bottom-0 mb-2 lg:mb-0 w-80 sm:w-96 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-island dark:shadow-islandDark z-[500] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono bg-[#F95721]/10 text-[#F95721] px-2 py-0.5 rounded-full font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] hover:text-[#F95721] flex items-center gap-1 transition-colors"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#ECE8E1]/60 dark:divide-[#2D2924]/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6E6B66] dark:text-[#8A8680]">
                No notifications right now.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                    !item.read_at ? "bg-[#F95721]/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-0.5 line-clamp-2">
                          {item.body}
                        </p>
                      )}
                      <span className="text-[10px] text-[#9E9A93] dark:text-[#635F59] mt-1.5 block">
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.link && (
                        <a
                          href={item.link}
                          onClick={() => markAsRead(item.id)}
                          className="p-1 text-[#6E6B66] dark:text-[#8A8680] hover:text-[#F95721] rounded"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {!item.read_at && (
                        <button
                          onClick={() => markAsRead(item.id)}
                          className="p-1 text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
