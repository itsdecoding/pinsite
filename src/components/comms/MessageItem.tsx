"use client";

import React, { useState } from "react";
import {
  Copy,
  Check,
  Edit2,
  Trash2,
  CheckCheck,
  Reply,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Message, MessageAttachment } from "./useCommsState";
import { ImageLightbox } from "./ImageLightbox";

interface MessageItemProps {
  message: Message;
  isCurrentUser: boolean;
  canManage: boolean;
  showSenderHeader: boolean;
  isChannel: boolean;
  onEdit: (messageId: string, newBody: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReply: (message: Message) => void;
  quotedMessage?: Message | null;
}

export function cleanSenderName(rawName?: string): string {
  if (!rawName) return "Teammate";
  return rawName
    .replace(/\s*\((?:Admin|Caller|Developer|Manager|Staff|Operator|User|Owner)\)/gi, "")
    .trim();
}

function MessageItemComponent({
  message,
  isCurrentUser,
  canManage,
  showSenderHeader,
  isChannel,
  onEdit,
  onDelete,
  onReply,
  quotedMessage,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const senderName = isCurrentUser
    ? "You"
    : cleanSenderName(message.profiles?.full_name);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("Copy to clipboard failed:", e);
    }
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onEdit(message.id, editText.trim());
      setIsEditing(false);
    } catch (e) {
      console.error("Failed to edit message:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Delete this message?")) {
      try {
        await onDelete(message.id);
      } catch (e) {
        console.error("Failed to delete message:", e);
      }
    }
  };

  // Helper to highlight @mentions in body
  const renderFormattedBody = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(?<=\s|^)(@[A-Za-z0-9_]+)\b/g);
    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        return (
          <span
            key={index}
            className="inline-block px-1 rounded font-medium bg-[#7F3922]/20 text-[#F95721]"
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Read receipts status:
  // ✓ single check = sent
  // ✓✓ double gray check = delivered
  // ✓✓ double blue check = read
  const isRead = Boolean(message.read_at);
  const isDelivered = Boolean(message.id);

  // Quote source
  const replyInfo = message.reply_to
    ? {
        ...message.reply_to,
        sender_name: cleanSenderName(message.reply_to.sender_name),
      }
    : quotedMessage
    ? {
        id: quotedMessage.id,
        sender_name: cleanSenderName(quotedMessage.profiles?.full_name),
        body: quotedMessage.body,
      }
    : null;

  const imageAttachments = message.attachments?.filter((att) => att.type === "image") || [];
  const fileAttachments = message.attachments?.filter((att) => att.type !== "image") || [];

  const isAutoPlaceholderText =
    message.body === "📷 Image" ||
    message.body === "📎 Attachment" ||
    /^📷 Image(\s*\(\d+\))?$/i.test(message.body);

  const shouldRenderText =
    isEditing || (message.body && (!isAutoPlaceholderText || imageAttachments.length === 0));

  const hasOnlyImages =
    imageAttachments.length > 0 &&
    !shouldRenderText &&
    fileAttachments.length === 0 &&
    !replyInfo &&
    !isEditing;

  const renderImageGrid = () => {
    if (imageAttachments.length === 0) return null;

    const count = imageAttachments.length;

    // 1 Image: Prominent single preview
    if (count === 1) {
      return (
        <div
          className="relative rounded-xl overflow-hidden w-[240px] sm:w-[300px] max-w-full cursor-pointer group bg-black/10 dark:bg-black/30 mb-1"
          onClick={() => setLightboxIndex(0)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageAttachments[0].url}
            alt={imageAttachments[0].name || "Attachment"}
            className="w-full max-h-[300px] sm:max-h-[340px] object-cover rounded-xl group-hover:opacity-95 transition"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        </div>
      );
    }

    // 2 Images: Side-by-side columns (refer reference image 4)
    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden w-[260px] sm:w-[320px] max-w-full h-[185px] sm:h-[225px] mb-1">
          {imageAttachments.map((att, idx) => (
            <div
              key={idx}
              className="relative w-full h-full overflow-hidden cursor-pointer group bg-black/15 dark:bg-black/30"
              onClick={() => setLightboxIndex(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.url}
                alt={att.name || "Attachment"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    // 3 Images: 1 large on left, 2 stacked on right
    if (count === 3) {
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-1 rounded-xl overflow-hidden w-[260px] sm:w-[320px] max-w-full h-[210px] sm:h-[250px] mb-1">
          <div
            className="row-span-2 relative w-full h-full overflow-hidden cursor-pointer group bg-black/15 dark:bg-black/30"
            onClick={() => setLightboxIndex(0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageAttachments[0].url}
              alt={imageAttachments[0].name || "Attachment"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div
            className="relative w-full h-full overflow-hidden cursor-pointer group bg-black/15 dark:bg-black/30"
            onClick={() => setLightboxIndex(1)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageAttachments[1].url}
              alt={imageAttachments[1].name || "Attachment"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div
            className="relative w-full h-full overflow-hidden cursor-pointer group bg-black/15 dark:bg-black/30"
            onClick={() => setLightboxIndex(2)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageAttachments[2].url}
              alt={imageAttachments[2].name || "Attachment"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
        </div>
      );
    }

    // 4 or more images: 2x2 square frame (refer reference image 3) with +N overlay if > 4
    const displayList = imageAttachments.slice(0, 4);
    const extraCount = count - 4;

    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1 rounded-xl overflow-hidden w-[260px] sm:w-[320px] max-w-full aspect-square mb-1">
        {displayList.map((att, idx) => (
          <div
            key={idx}
            className="relative w-full h-full overflow-hidden cursor-pointer group bg-black/15 dark:bg-black/30"
            onClick={() => setLightboxIndex(idx)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={att.url}
              alt={att.name || "Attachment"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            {idx === 3 && extraCount > 0 && (
              <div className="absolute inset-0 bg-black/65 flex items-center justify-center text-white text-xl sm:text-2xl font-bold backdrop-blur-[1px] hover:bg-black/75 transition">
                +{extraCount + 1}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={`group relative flex w-full my-0.5 select-text ${
        isCurrentUser ? "justify-end" : "justify-start"
      }`}
    >
      {/* WhatsApp In-App Image Lightbox Modal */}
      {lightboxIndex !== null && (
        <ImageLightbox
          isOpen={lightboxIndex !== null}
          images={imageAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          senderName={senderName}
        />
      )}

      {/* WhatsApp Message Bubble (NO outer box, right-aligned for self, left for others) */}
      <div
        className={`relative ${
          hasOnlyImages
            ? "max-w-[90%] sm:max-w-[75%] md:max-w-[70%] p-1.5 sm:p-2"
            : "max-w-[85%] sm:max-w-[70%] md:max-w-[65%] px-3 py-2"
        } rounded-2xl shadow-sm text-xs leading-relaxed transition ${
          isCurrentUser
            ? "bg-[#7F3922]/25 dark:bg-[#7F3922]/35 border border-[#7F3922]/40 text-[#111110] dark:text-[#F5F3EF] rounded-tr-sm"
            : "bg-zinc-200/90 dark:bg-[#1E1F20] border border-black/[0.04] dark:border-white/[0.06] text-[#111110] dark:text-[#E4E2DF] rounded-tl-sm"
        }`}
      >
        {/* Channel Sender Name (shown only once per consecutive group, not on own messages) */}
        {!isCurrentUser && isChannel && showSenderHeader && (
          <div
            className={`text-[11px] font-bold text-[#F95721] mb-1 select-none ${
              hasOnlyImages ? "px-1 pt-0.5" : ""
            }`}
          >
            {senderName}
          </div>
        )}

        {/* Reply Quote Banner inside Bubble */}
        {replyInfo && (
          <div className="mb-2 p-2 rounded-lg bg-black/[0.06] dark:bg-black/30 border-l-4 border-[#F95721] text-[11px] select-none">
            <div className="font-semibold text-[#F95721] text-[10px] mb-0.5">
              {replyInfo.sender_name}
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 line-clamp-2 italic">
              {replyInfo.body}
            </div>
          </div>
        )}

        {/* WhatsApp Multi-Image Grid Frame */}
        {renderImageGrid()}

        {/* Non-image File Attachments */}
        {fileAttachments.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {fileAttachments.map((att, idx) => (
              <a
                key={idx}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.09] transition"
              >
                <FileText className="w-5 h-5 text-[#F95721] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate">{att.name}</p>
                  {att.size && (
                    <p className="text-[9px] text-zinc-400 font-mono">{att.size}</p>
                  )}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Message Body or Inline Editor */}
        {isEditing ? (
          <div className="space-y-2 pt-1 min-w-[220px]">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditText(message.body);
                }
              }}
              className="w-full bg-white dark:bg-black/50 border border-black/[0.1] dark:border-white/[0.15] focus:border-black/20 dark:focus:border-white/20 rounded-xl p-2 text-xs text-[#111110] dark:text-zinc-100 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 shadow-none"
              rows={2}
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditText(message.body);
                  setIsEditing(false);
                }}
                className="px-2 py-1 text-[11px] rounded-lg bg-zinc-300 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#F95721] text-white"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : shouldRenderText ? (
          <div className="inline break-words whitespace-pre-wrap mt-0.5">
            {renderFormattedBody(message.body)}
          </div>
        ) : null}

        {/* WhatsApp Timestamp & Read Receipts inside Bubble, Bottom-Right */}
        <div
          className={`${
            hasOnlyImages
              ? "flex items-center justify-end gap-1 pt-0.5 px-1 select-none"
              : "flex items-center justify-end gap-1 float-right ml-3 mt-1 select-none"
          }`}
        >
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400 font-mono leading-none">
            {formatTime(message.created_at)}
          </span>
          {message.edited_at && (
            <span className="text-[9px] text-zinc-400/80 italic leading-none">(edited)</span>
          )}
          {isCurrentUser && (
            <span
              className="inline-flex items-center leading-none"
              title={isRead ? "Read" : isDelivered ? "Delivered" : "Sent"}
            >
              {isRead ? (
                <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
              ) : isDelivered ? (
                <CheckCheck className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-400" />
              ) : (
                <Check className="w-3 h-3 text-zinc-400 dark:text-zinc-400" />
              )}
            </span>
          )}
        </div>


        {/* Floating Quick Action Button on Hover (Reply, Copy, Options) */}
        {!isEditing && (
          <div
            className={`absolute top-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-[#1E1F20] border border-black/[0.08] dark:border-white/[0.12] rounded-lg px-1 py-0.5 shadow-md z-10 ${
              isCurrentUser ? "-left-16" : "-right-16"
            }`}
          >
            <button
              type="button"
              onClick={() => onReply(message)}
              title="Reply"
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy"
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  title="Edit"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  title="Delete"
                  className="p-1 rounded text-zinc-400 hover:text-rose-500 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function areAttachmentsEqual(a?: MessageAttachment[], b?: MessageAttachment[]) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].url !== b[i].url || a[i].name !== b[i].name || a[i].type !== b[i].type) {
      return false;
    }
  }
  return true;
}

export const MessageItem = React.memo(MessageItemComponent, (prev, next) => {
  if (
    prev.isCurrentUser !== next.isCurrentUser ||
    prev.canManage !== next.canManage ||
    prev.showSenderHeader !== next.showSenderHeader ||
    prev.isChannel !== next.isChannel ||
    prev.onEdit !== next.onEdit ||
    prev.onDelete !== next.onDelete ||
    prev.onReply !== next.onReply ||
    prev.quotedMessage?.id !== next.quotedMessage?.id ||
    prev.quotedMessage?.body !== next.quotedMessage?.body
  ) {
    return false;
  }

  if (prev.message === next.message) {
    return true;
  }

  return (
    prev.message.id === next.message.id &&
    prev.message.body === next.message.body &&
    prev.message.edited_at === next.message.edited_at &&
    prev.message.deleted_at === next.message.deleted_at &&
    prev.message.read_at === next.message.read_at &&
    prev.message.profiles?.full_name === next.message.profiles?.full_name &&
    prev.message.reply_to?.id === next.message.reply_to?.id &&
    prev.message.reply_to?.body === next.message.reply_to?.body &&
    areAttachmentsEqual(prev.message.attachments, next.message.attachments)
  );
});
