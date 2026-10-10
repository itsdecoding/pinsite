"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Send,
  Smile,
  Paperclip,
  Mic,
  X,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Theme, EmojiClickData } from "emoji-picker-react";
import { Message, MessageAttachment, PublicProfile } from "./useCommsState";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="w-[320px] h-[380px] flex items-center justify-center bg-white dark:bg-[#1C1A17] rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl">
      <Loader2 className="w-6 h-6 animate-spin text-[#F95721]" />
    </div>
  ),
});

interface MessageComposerProps {
  onSendMessage: (
    text: string,
    replyTo?: Message | null,
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  onTyping: () => void;
  replyingToMessage: Message | null;
  onCancelReply: () => void;
  teamMembers?: PublicProfile[];
  placeholder?: string;
  disabled?: boolean;
}

export function MessageComposer({
  onSendMessage,
  onTyping,
  replyingToMessage,
  onCancelReply,
  teamMembers = [],
  placeholder = "Type a message",
  disabled = false,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme } = useTheme();

  // Filter team members based on @mention query
  const filteredMentionMembers = useMemo(() => {
    if (!mentionQuery) return teamMembers.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return teamMembers
      .filter((m) => m.full_name?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [teamMembers, mentionQuery]);

  // Click outside listener for emoji picker & mention dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(event.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-resize textarea height up to 140px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        140
      )}px`;
    }
  }, [text]);

  const handleSelectMention = (member: PublicProfile) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart || text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Replace trailing @query with @FullName + trailing space
    const updatedBefore = textBeforeCursor.replace(
      /(?:^|\s)@([A-Za-z0-9_]*)$/,
      (match) => {
        const prefix = match.startsWith(" ") ? " " : "";
        return `${prefix}@${member.full_name} `;
      }
    );

    const newText = updatedBefore + textAfterCursor;
    setText(newText);
    setShowMentionDropdown(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          updatedBefore.length,
          updatedBefore.length
        );
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    // Handle mention navigation
    if (showMentionDropdown && filteredMentionMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentionMembers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev === 0 ? filteredMentionMembers.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectMention(filteredMentionMembers[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onTyping();

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([A-Za-z0-9_]*)$/);

    if (match && teamMembers.length > 0) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
      setShowMentionDropdown(true);
    } else {
      setShowMentionDropdown(false);
    }
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    if (!textareaRef.current) {
      setText((prev) => `${prev}${emojiData.emoji}`);
      setShowEmojiPicker(false);
      return;
    }
    const cursorPos = textareaRef.current.selectionStart || text.length;
    const newText =
      text.slice(0, cursorPos) + emojiData.emoji + text.slice(cursorPos);
    setText(newText);
    setShowEmojiPicker(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = cursorPos + emojiData.emoji.length;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleSend = async () => {
    const hasAttachments = pendingAttachments.length > 0;
    if ((!text.trim() && !hasAttachments) || isSending || disabled) return;

    const messageToSend = text.trim();
    const attachmentsToSend = [...pendingAttachments];

    setIsSending(true);
    setText("");
    setPendingAttachments([]);
    setShowEmojiPicker(false);
    setShowMentionDropdown(false);

    try {
      await onSendMessage(messageToSend, replyingToMessage, attachmentsToSend);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      console.error("Message send failed:", err);
      setText(messageToSend);
      setPendingAttachments(attachmentsToSend);
    } finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: MessageAttachment[] = [];
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith("image/");
      const blobUrl = URL.createObjectURL(file);
      const sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
      newAttachments.push({
        type: isImg ? "image" : "file",
        url: blobUrl,
        name: file.name,
        size: sizeStr,
      });
    });

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleVoice = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      setIsRecording(true);
      setTimeout(() => {
        setIsRecording(false);
      }, 3000);
    }
  };

  const hasContent = text.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div className="relative bg-white dark:bg-[#111213] border-t border-black/[0.06] dark:border-white/[0.08] p-2 sm:p-3 select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Browsable Emoji Picker Popup */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full mb-2 left-2 z-50 shadow-2xl rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
            searchPlaceHolder="Search emoji..."
            width={320}
            height={380}
          />
        </div>
      )}

      {/* @Mention Autocomplete Dropdown */}
      {showMentionDropdown && filteredMentionMembers.length > 0 && (
        <div
          ref={mentionDropdownRef}
          className="absolute bottom-full mb-2 left-10 sm:left-14 w-72 max-h-56 overflow-y-auto rounded-2xl bg-white dark:bg-[#1C1A17] border border-black/10 dark:border-white/12 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Mention Member
          </div>
          {filteredMentionMembers.map((member, idx) => (
            <button
              key={member.id}
              type="button"
              onClick={() => handleSelectMention(member)}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition ${
                idx === mentionIndex
                  ? "bg-[#7F3922]/20 text-[#F95721] font-semibold"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[#7F3922]/20 text-[#F95721] flex items-center justify-center text-xs font-bold shrink-0">
                  {member.full_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs truncate">{member.full_name}</span>
              </div>
              <span className="text-[10px] text-zinc-400 capitalize shrink-0 ml-1">
                {member.role}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp Reply Banner Above Input */}
      {replyingToMessage && (
        <div className="mb-2 p-2 px-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border-l-4 border-[#F95721] flex items-center justify-between animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold text-[#F95721] block">
              Replying to {replyingToMessage.profiles?.full_name || "Teammate"}
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {replyingToMessage.body}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attachment Previews in Composer */}
      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto p-1">
          {pendingAttachments.map((att, idx) => (
            <div
              key={idx}
              className="relative rounded-xl border border-black/10 dark:border-white/10 overflow-hidden bg-black/5 dark:bg-white/5 p-1 flex items-center gap-1.5 shrink-0"
            >
              {att.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.url}
                  alt={att.name}
                  className="w-10 h-10 object-cover rounded-lg"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-[#F95721]" />
              )}
              <span className="text-[10px] text-zinc-400 max-w-[90px] truncate">
                {att.name}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                }
                className="p-0.5 rounded-full bg-black/20 hover:bg-black/40 text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp Input Row: emoji + attach on left, input middle, voice or send right */}
      <div className="flex items-end gap-1.5 sm:gap-2">
        {/* Left Icons: Emoji + Attach */}
        <div className="flex items-center gap-0.5 pb-1 text-zinc-400 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Choose emoji"
            className={`p-2 rounded-full hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition ${
              showEmojiPicker ? "text-[#F95721] bg-[#7F3922]/15" : ""
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or photo"
            className="p-2 rounded-full hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition"
          >
            <Paperclip className="w-5 h-5" />
          </button>
        </div>

        {/* Center Textarea */}
        <div className="flex-1 bg-black/[0.03] dark:bg-[#1E1F20] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl px-3.5 py-2 focus-within:border-[#7F3922]/60 transition min-h-[40px] flex items-center">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSending}
            rows={1}
            className="w-full bg-transparent resize-none text-xs text-[#111110] dark:text-zinc-100 placeholder-zinc-400 focus:outline-none max-h-[140px] leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700/30"
          />
        </div>

        {/* Right Icon: Voice Memo when empty, Circular Send button when text is entered */}
        <div className="pb-0.5">
          {hasContent ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || disabled}
              title="Send message"
              className="w-9 h-9 rounded-full bg-[#7F3922] hover:bg-[#F95721] text-white flex items-center justify-center shadow-md active:scale-95 transition disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleVoice}
              title={isRecording ? "Recording voice note..." : "Voice note"}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${
                isRecording
                  ? "bg-rose-500 text-white animate-pulse"
                  : "text-zinc-400 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
