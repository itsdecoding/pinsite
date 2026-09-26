"use client";

import React, { useEffect, useState, useRef } from "react";
import { Send, AtSign, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface EntityCommentsProps {
  entityType: "lead" | "project" | "task" | "deal";
  entityId: string;
}

interface CommentItem {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
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

export function EntityComments({ entityType, entityId }: EntityCommentsProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase.from("profiles_public").select("id, full_name, role");
      if (data) setPublicProfiles(data);
    }
    loadProfiles();

    async function loadComments() {
      const { data } = await supabase
        .from("entity_comments")
        .select(`
          id,
          user_id,
          body,
          created_at,
          profiles:user_id (full_name, role)
        `)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (data) setComments(data as any);
    }
    loadComments();

    const channel = supabase
      .channel(`comments-${entityType}-${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entity_comments",
          filter: `entity_id=eq.${entityId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("full_name, role")
            .eq("id", newRow.user_id)
            .maybeSingle();

          setComments((prev) => [
            ...prev,
            { ...newRow, profiles: userProfile || { full_name: "Operator", role: "caller" } },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityType, entityId]);

  function insertMention(profile: PublicProfile) {
    const mentionTag = `@[${profile.id}:${profile.full_name}] `;
    setNewComment((prev) => prev + mentionTag);
    setShowMentionPicker(false);
    textareaRef.current?.focus();
  }

  function renderCommentBody(text: string) {
    const mentionRegex = /@\[([a-f0-9-]+):([^\]]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const [, , name] = match;
      parts.push(
        <span
          key={match.index}
          className="inline-flex items-center px-2 py-0.5 bg-[#F95721]/10 text-[#F95721] font-semibold text-xs rounded-full mx-0.5"
        >
          @{name}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { data: insertedComment, error: commentError } = await supabase
        .from("entity_comments")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          user_id: user.id,
          body: newComment.trim(),
        })
        .select()
        .single();

      if (commentError) throw commentError;

      const mentionRegex = /@\[([a-f0-9-]+):([^\]]+)\]/g;
      let match;
      while ((match = mentionRegex.exec(newComment)) !== null) {
        const targetUserId = match[1];
        if (targetUserId && targetUserId !== user.id) {
          await supabase.from("notifications").insert({
            user_id: targetUserId,
            type: "mention",
            title: `Mentioned in ${entityType}`,
            body: newComment.substring(0, 100),
            entity_type: entityType,
            entity_id: entityId,
            link: entityType === "lead" ? "/queue" : "/projects",
          });
        }
      }

      setNewComment("");
    } catch (err: any) {
      console.error("Comment submit error:", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] bg-white dark:bg-[#1C1A17] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono">
          Internal Discussion & Notes
        </span>
        <span className="text-[11px] font-mono text-[#F95721] font-semibold">
          {comments.length} notes
        </span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[280px]">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#6E6B66] dark:text-[#8A8680]">
            No notes yet. Type a comment or @mention a teammate.
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="text-xs space-y-1 bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#111110] dark:text-[#F5F3EF] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F95721]" />
                  {c.profiles?.full_name || "Operator"}
                  <span className="text-[10px] uppercase font-mono text-[#6E6B66] dark:text-[#8A8680] px-1.5 py-0.2 rounded-full bg-black/5 dark:bg-white/10">
                    {c.profiles?.role || "team"}
                  </span>
                </span>
                <span className="text-[10px] text-[#9E9A93] dark:text-[#635F59]">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-[#6E6B66] dark:text-[#8A8680] leading-relaxed pt-1">
                {renderCommentBody(c.body)}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-[#ECE8E1] dark:border-[#2D2924] relative bg-black/[0.02] dark:bg-white/[0.02]">
        {showMentionPicker && (
          <div className="absolute bottom-full left-3 mb-2 w-56 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl shadow-island dark:shadow-islandDark z-50 max-h-48 overflow-y-auto divide-y divide-[#ECE8E1]/60 dark:divide-[#2D2924]/60">
            <div className="px-3 py-1.5 text-[10px] uppercase font-mono text-[#6E6B66] dark:text-[#8A8680]">
              Mention Operator
            </div>
            {publicProfiles.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => insertMention(p)}
                className="w-full text-left px-3 py-2 text-xs text-[#111110] dark:text-[#F5F3EF] hover:bg-[#F95721] hover:text-white flex items-center justify-between"
              >
                <span>{p.full_name}</span>
                <span className="text-[10px] opacity-75 uppercase font-mono">{p.role}</span>
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={2}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type note or @ to mention..."
            className="w-full text-xs bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-xl p-2.5 text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#6E6B66] outline-none resize-none"
          />

          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={() => setShowMentionPicker((prev) => !prev)}
              className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#F95721] flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <AtSign className="w-3.5 h-3.5" />
              <span>Mention</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="px-3.5 py-1.5 bg-[#F95721] hover:bg-[#E04612] text-white font-semibold text-xs rounded-full flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
