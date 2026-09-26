"use client";

import React, { useEffect, useState, useRef } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();

  useEffect(() => {
    let currentUserId: string | null = null;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId = user.id;

      // Fetch unread & recent notifications
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read_at).length);
      }

      // Realtime subscription to notifications
      const channel = supabase
        .channel(`user-notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as NotificationItem;
            setNotifications((prev) => [newNotif, ...prev]);
            setUnreadCount((prev) => prev + 1);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    init();

    // Click outside to close
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
        className="relative p-2 rounded-md hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
        aria-label="View notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-[10px] font-bold text-background-base animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg bg-background-surface border border-border-subtle shadow-popover z-[500] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-background-elevated/40">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-accent-subtle text-accent-primary border border-accent-border px-1.5 py-0.5 rounded">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-text-secondary hover:text-accent-primary flex items-center gap-1 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border-subtle">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                No notifications right now.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 transition-colors hover:bg-background-elevated/60 ${
                    !item.read_at ? "bg-accent-subtle/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {item.body}
                        </p>
                      )}
                      <span className="text-[10px] text-text-muted mt-1.5 block">
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
                          className="p-1 text-text-secondary hover:text-accent-primary rounded"
                          title="Open link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {!item.read_at && (
                        <button
                          onClick={() => markAsRead(item.id)}
                          className="p-1 text-text-muted hover:text-text-primary rounded"
                          title="Mark read"
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
