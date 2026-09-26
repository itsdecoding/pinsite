"use client";

import React, { useEffect, useState, useRef } from "react";
import { Send, AtSign, Loader2, User } from "lucide-react";
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
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const supabase = createClient();

  useEffect(() => {
    // 1. Fetch public profiles for mentions
    async function loadProfiles() {
      const { data } = await supabase.from("profiles_public").select("id, full_name, role");
      if (data) setPublicProfiles(data);
    }
    loadProfiles();

    // 2. Fetch comments for this entity
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

    // 3. Subscribe to Realtime comments
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

  // Insert mention into textarea
  function insertMention(profile: PublicProfile) {
    const mentionTag = `@[${profile.id}:${profile.full_name}] `;
    setNewComment((prev) => prev + mentionTag);
    setShowMentionPicker(false);
    textareaRef.current?.focus();
  }

  // Parse body text and render mentions as styled badges
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
          className="inline-flex items-center px-1.5 py-0.2 bg-accent-subtle border border-accent-border text-accent-primary text-xs font-medium rounded mx-0.5"
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

      // 1. Insert comment
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

      // 2. Parse @[uuid:name] mentions and dispatch notifications
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
    <div className="flex flex-col h-full bg-background-surface rounded-lg border border-border-subtle overflow-hidden">
      <div className="px-4 py-2.5 bg-background-elevated/50 border-b border-border-subtle flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary font-mono">
          Entity Activity & Thread
        </span>
        <span className="text-[11px] text-text-muted">{comments.length} comments</span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[300px]">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-xs text-text-muted">
            No activity notes yet. Leave an internal comment or @mention a team member.
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="text-xs space-y-1 bg-background-card p-3 rounded-lg border border-border-subtle">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                  {c.profiles?.full_name || "Operator"}
                  <span className="text-[10px] uppercase font-mono text-text-muted px-1 rounded bg-background-elevated">
                    {c.profiles?.role || "team"}
                  </span>
                </span>
                <span className="text-[10px] text-text-muted">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-text-secondary leading-relaxed pt-1">
                {renderCommentBody(c.body)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Form with Mention Helper */}
      <form onSubmit={handleSend} className="p-3 bg-background-elevated/30 border-t border-border-subtle relative">
        {showMentionPicker && (
          <div className="absolute bottom-full left-3 mb-2 w-56 bg-background-elevated border border-border-subtle rounded-lg shadow-popover z-50 max-h-48 overflow-y-auto divide-y divide-border-subtle">
            <div className="px-3 py-1.5 text-[10px] uppercase font-mono text-text-muted bg-background-surface">
              Select Operator
            </div>
            {publicProfiles.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => insertMention(p)}
                className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent-subtle hover:text-accent-primary flex items-center justify-between"
              >
                <span>{p.full_name}</span>
                <span className="text-[10px] text-text-muted uppercase font-mono">{p.role}</span>
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
            placeholder="Type comment or press @ to mention..."
            className="w-full text-xs bg-background-input border border-border-subtle focus:border-border-focus rounded-md p-2.5 text-text-primary placeholder:text-text-placeholder outline-none resize-none"
          />

          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={() => setShowMentionPicker((prev) => !prev)}
              className="text-xs text-text-secondary hover:text-accent-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-background-elevated transition-colors"
            >
              <AtSign className="w-3.5 h-3.5" />
              <span>Mention</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="px-3 py-1.5 bg-accent-primary hover:bg-accent-hover text-background-base font-semibold text-xs rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
