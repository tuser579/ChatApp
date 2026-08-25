"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Check, CheckCheck, File as FileIcon, Mic, Loader2, Play, Pause,
  Download, ExternalLink, Smile, Reply, Pencil, Trash2, X,
  Pin, PinOff, Forward, Search, Info, ChevronUp, ChevronDown,
  Bookmark, Users, Volume2, Image as ImageIcon
} from "lucide-react";
import Link from "next/link";
import { connectSocket, getSocket } from "@/lib/socket";
import MediaLightbox from "@/components/MediaLightbox";
import StickerPicker from "@/components/StickerPicker";
import ForwardModal from "@/components/ForwardModal";
import ChatInfoDrawer from "@/components/ChatInfoDrawer";

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];

function Avatar({ name, avatar, size = 40, online, isSavedMessages, isGroup }) {
  if (isSavedMessages) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg,#3390ec,#60b1ff)",
        }}
      >
        <Bookmark className="w-5 h-5" />
      </div>
    );
  }

  if (isGroup) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg,#6366f1,#06b6d4)",
        }}
      >
        <Users className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatar ? (
        <img src={avatar} className="rounded-full w-full h-full object-cover shadow-sm" alt={name || "User"} />
      ) : (
        <div
          className="rounded-full w-full h-full flex items-center justify-center font-bold text-white shadow-sm"
          style={{
            background: "linear-gradient(135deg,#6366f1,#06b6d4)",
            fontSize: size * 0.38,
          }}
        >
          {name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
      {online !== undefined && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
          style={{
            background: online ? "var(--tg-success)" : "var(--tg-text-subtle)",
            borderColor: "var(--tg-sidebar)",
          }}
        />
      )}
    </div>
  );
}

// Telegram-styled Audio Voice Note Player with Waveform
function AudioPlayer({ src, isMe }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  const speedOptions = [1, 1.5, 2];

  const toggleSpeed = () => {
    const nextIdx = (speedOptions.indexOf(speed) + 1) % speedOptions.length;
    const nextSpeed = speedOptions[nextIdx];
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 0;
    setCurrentTime(curr);
    setDuration(dur);
    setProgress(dur ? (curr / dur) * 100 : 0);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Generate 24 static waveform heights for audio visualizer
  const waveHeights = [8, 14, 18, 10, 22, 16, 26, 12, 20, 28, 14, 22, 18, 10, 24, 16, 20, 14, 26, 18, 12, 22, 16, 10];

  return (
    <div className="flex items-center gap-3 py-1 min-w-[240px] max-w-full select-none">
      <button
        type="button"
        onClick={() => {
          if (playing) {
            audioRef.current?.pause();
          } else {
            audioRef.current?.play();
          }
          setPlaying(!playing);
        }}
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-md"
        style={{
          background: isMe ? "rgba(255,255,255,0.25)" : "var(--tg-accent)",
          color: "#ffffff",
        }}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Waveform Bar Track */}
        <div
          className="flex items-center gap-[2px] h-7 cursor-pointer"
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audioRef.current.currentTime = pos * duration;
          }}
        >
          {waveHeights.map((h, i) => {
            const barPos = (i / waveHeights.length) * 100;
            const isPlayed = barPos <= progress;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors"
                style={{
                  height: `${h}px`,
                  background: isPlayed
                    ? isMe ? "#ffffff" : "var(--tg-accent)"
                    : isMe ? "rgba(255,255,255,0.3)" : "rgba(112,132,153,0.35)",
                }}
              />
            );
          })}
        </div>

        <div
          className="flex justify-between text-[11px] font-medium opacity-85"
          style={{ color: isMe ? "rgba(255,255,255,0.9)" : "var(--tg-text-muted)" }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleSpeed}
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors hover:opacity-80"
        style={{
          background: isMe ? "rgba(255,255,255,0.2)" : "rgba(112,132,153,0.18)",
          color: isMe ? "#ffffff" : "var(--tg-text)",
        }}
      >
        {speed}x
      </button>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      />
    </div>
  );
}

// Telegram Message Bubble Component
function MessageBubble({
  msg,
  isMe,
  myId,
  isGroup,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  onForward,
  onOpenMedia,
  onScrollTo,
}) {
  const [showMenu, setShowMenu] = useState(false);

  // Group reactions
  const reactionCounts = (msg.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, users: [], hasReacted: false };
    acc[r.emoji].count += 1;
    acc[r.emoji].users.push(r.user);
    if (r.user?.toString() === myId?.toString() || r.user?._id?.toString() === myId?.toString()) {
      acc[r.emoji].hasReacted = true;
    }
    return acc;
  }, {});

  const getReplySnippet = (reply) => {
    if (!reply) return "";
    if (reply.isDeleted) return "Message deleted";
    if (reply.type === "image") return "📷 Photo";
    if (reply.type === "audio") return "🎵 Voice message";
    if (reply.type === "file") return `📄 ${reply.fileName || "File"}`;
    if (reply.type === "sticker") return "✨ Sticker";
    return reply.content || "";
  };

  return (
    <div
      id={`msg-${msg._id}`}
      className={`group relative flex items-end gap-2 my-1.5 pt-2 ${
        isMe ? "justify-end" : "justify-start"
      }`}
    >
      {/* Sender Avatar in Group Chat */}
      {!isMe && isGroup && (
        <Avatar name={msg.sender?.name} avatar={msg.sender?.avatar} size={32} />
      )}

      <div className={`relative max-w-[85%] sm:max-w-md lg:max-w-lg flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        
        {/* Floating Quick Action Pill Bar */}
        {!msg.isDeleted && (
          <div
            className={`absolute -top-7 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-150 ${
              showMenu
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 group-hover:opacity-100 pointer-events-auto"
            } ${isMe ? "right-1" : "left-1"}`}
            style={{
              background: "var(--tg-card)",
              borderColor: "var(--tg-border)",
              boxShadow: "var(--tg-shadow-lg)",
            }}
          >
            {/* Emojis */}
            {QUICK_EMOJIS.slice(0, 5).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(msg._id, emoji);
                  setShowMenu(false);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-130 transition-transform text-sm hover:bg-white/10"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}

            <div className="w-[1px] h-3.5 mx-0.5 bg-[var(--tg-border)]" />

            {/* Reply */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReply(msg);
                setShowMenu(false);
              }}
              className="p-1 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            {/* Forward */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onForward(msg);
                setShowMenu(false);
              }}
              className="p-1 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Forward"
            >
              <Forward className="w-3.5 h-3.5" />
            </button>

            {/* Pin */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPin(msg._id);
                setShowMenu(false);
              }}
              className="p-1 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title={msg.isPinned ? "Unpin message" : "Pin message"}
            >
              {msg.isPinned ? <PinOff className="w-3.5 h-3.5 text-amber-400" /> : <Pin className="w-3.5 h-3.5" />}
            </button>

            {/* Edit (if me and text) */}
            {isMe && msg.type === "text" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(msg);
                  setShowMenu(false);
                }}
                className="p-1 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
                title="Edit message"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete */}
            {isMe && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(msg._id);
                  setShowMenu(false);
                }}
                className="p-1 rounded-full text-[var(--tg-danger)] hover:bg-red-500/20 transition"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Bubble Box */}
        <div
          onClick={() => setShowMenu(!showMenu)}
          className={`px-3.5 py-2 rounded-2xl relative shadow-sm transition-all cursor-pointer select-text ${
            isMe ? "tg-tail-out rounded-br-none" : "tg-tail-in rounded-bl-none"
          }`}
          style={{
            background: msg.isDeleted
              ? "rgba(112,132,153,0.15)"
              : isMe
              ? "var(--tg-bubble-me)"
              : "var(--tg-bubble-them)",
            color: msg.isDeleted
              ? "var(--tg-text-muted)"
              : isMe
              ? "var(--tg-bubble-me-fg)"
              : "var(--tg-bubble-them-fg)",
            border: msg.isDeleted ? "1px dashed var(--tg-border)" : "none",
          }}
        >
          {/* Sender Name in Group Chat */}
          {!isMe && isGroup && (
            <p className="text-xs font-bold text-[var(--tg-accent)] mb-1">
              {msg.sender?.name || "Member"}
            </p>
          )}

          {/* Forwarded Header */}
          {msg.isForwarded && (
            <div className="flex items-center gap-1 text-[11px] text-[var(--tg-accent)] font-semibold mb-1 opacity-90">
              <Forward className="w-3 h-3" />
              <span>Forwarded from {msg.forwardFrom?.name || "User"}</span>
            </div>
          )}

          {/* Reply Quote Banner */}
          {msg.replyTo && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onScrollTo(msg.replyTo._id);
              }}
              className="mb-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer border-l-4 transition hover:opacity-90 flex flex-col gap-0.5"
              style={{
                background: "rgba(0,0,0,0.16)",
                borderLeftColor: isMe ? "#ffffff" : "var(--tg-accent)",
                color: isMe ? "rgba(255,255,255,0.95)" : "var(--tg-text)",
              }}
            >
              <span className="font-bold text-[11px] opacity-90 truncate">
                {msg.replyTo.sender?.name || "User"}
              </span>
              <p className="truncate opacity-80 text-[11px]">
                {getReplySnippet(msg.replyTo)}
              </p>
            </div>
          )}

          {/* Message Content */}
          {msg.isDeleted ? (
            <p className="text-xs italic flex items-center gap-1.5 py-0.5 opacity-80">
              <span>🚫 Message deleted</span>
            </p>
          ) : (
            <>
              {/* Image Type */}
              {msg.type === "image" && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMedia(msg.mediaUrl);
                  }}
                  className="relative group/img cursor-pointer rounded-xl overflow-hidden mb-1"
                >
                  <img
                    src={msg.mediaUrl}
                    alt="Photo"
                    className="rounded-xl max-w-full object-cover shadow-sm hover:scale-[1.01] transition-transform"
                    style={{ maxHeight: 280 }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(msg.mediaUrl, "_blank");
                    }}
                    className="absolute bottom-2 right-2 p-1.5 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 text-white text-xs font-semibold backdrop-blur-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Sticker Type */}
              {msg.type === "sticker" && (
                <div className="py-1">
                  <img
                    src={msg.mediaUrl}
                    alt="Sticker"
                    className="w-36 h-36 object-contain drop-shadow-md hover:scale-105 transition-transform"
                  />
                </div>
              )}

              {/* Audio / Voice Message */}
              {msg.type === "audio" && <AudioPlayer src={msg.mediaUrl} isMe={isMe} />}

              {/* Document / File Type */}
              {msg.type === "file" && (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-3 text-sm hover:opacity-85 transition py-1"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{
                      background: isMe ? "rgba(255,255,255,0.22)" : "var(--tg-accent)",
                      color: "#ffffff",
                    }}
                  >
                    <FileIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate max-w-[170px] font-semibold text-xs leading-snug">
                      {msg.fileName || "Document"}
                    </p>
                    <span className="text-[10px] opacity-75">
                      {msg.fileSize || "Download"}
                    </span>
                  </div>
                  <Download className="w-4 h-4 shrink-0 opacity-80" />
                </a>
              )}

              {/* Text Type */}
              {(msg.type === "text" || !msg.type) && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pr-12">
                  {msg.content}
                </p>
              )}
            </>
          )}

          {/* Bottom-right Metadata: Time, Edited indicator, Status ticks */}
          <div
            className="flex items-center gap-1 justify-end float-right -mt-2 ml-2 select-none"
            style={{
              color: isMe ? "var(--tg-time-me)" : "var(--tg-time-them)",
            }}
          >
            {msg.isPinned && (
              <Pin className="w-3 h-3 text-amber-400 rotate-45" />
            )}
            {msg.isEdited && !msg.isDeleted && (
              <span className="text-[10px] italic">edited</span>
            )}
            <span className="text-[10px] font-medium">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isMe && !msg.isDeleted && (
              msg.seen?.length > 1 ? (
                <CheckCheck className="w-3.5 h-3.5 text-[var(--tg-tick-seen)]" />
              ) : (
                <Check className="w-3.5 h-3.5 opacity-80" />
              )
            )}
          </div>
        </div>

        {/* Reaction Badges */}
        {Object.keys(reactionCounts).length > 0 && !msg.isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(msg._id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition active:scale-95 ${
                  data.hasReacted ? "ring-1 ring-[var(--tg-accent)]" : ""
                }`}
                style={{
                  background: data.hasReacted ? "var(--tg-accent-light)" : "var(--tg-card)",
                  borderColor: data.hasReacted ? "var(--tg-accent)" : "var(--tg-border)",
                  color: "var(--tg-text)",
                }}
              >
                <span>{emoji}</span>
                {data.count > 1 && <span className="text-[11px] opacity-80">{data.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState(null);
  const [typingAction, setTypingAction] = useState("typing");
  const [other, setOther] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState("");
  const [me, setMe] = useState({});
  const [allConvos, setAllConvos] = useState([]);

  // Modals & Drawers
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [forwardingMsg, setForwardingMsg] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // In-Chat Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const mediaRecRef = useRef(null);
  const recordTimerRef = useRef(null);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem("token") || "";
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
    setMe(u);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !token || !id) return;
    loadMessages();
    initSocket();
    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off("message:new");
        socket.off("typing:start");
        socket.off("typing:stop");
        socket.off("typing:action");
        socket.off("message:seen");
        socket.off("message:reaction_updated");
        socket.off("message:edited");
        socket.off("message:deleted");
        socket.off("message:pinned");
        socket.off("message:unpinned");
        socket.emit("leave:conversation", id);
      }
    };
  }, [mounted, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Handle in-chat search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setSearchMatchIdx(0);
      return;
    }
    const matches = messages.filter((m) =>
      m.content?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchMatches(matches);
    setSearchMatchIdx(0);
    if (matches.length > 0) {
      scrollToMessage(matches[0]._id);
    }
  }, [searchQuery]);

  const handleNextSearch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (searchMatchIdx + 1) % searchMatches.length;
    setSearchMatchIdx(nextIdx);
    scrollToMessage(searchMatches[nextIdx]._id);
  };

  const handlePrevSearch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (searchMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIdx(prevIdx);
    scrollToMessage(searchMatches[prevIdx]._id);
  };

  async function loadMessages() {
    try {
      const [msgRes, convoRes] = await Promise.all([
        fetch(`/api/messages?conversationId=${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const msgData = await msgRes.json();
      const convoData = await convoRes.json();
      setMessages(msgData.messages || []);
      setAllConvos(convoData.conversations || []);

      const convo = convoData.conversations?.find((c) => c._id === id);
      if (convo) {
        setConversation(convo);
        const myId = me?.id || me?._id;
        setOther(convo.participants?.find((p) => p._id !== myId && String(p._id) !== String(myId)));
      }
    } catch (err) {
      console.error("Load error:", err);
    }
  }

  async function initSocket() {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = u?.id || u?._id;
    if (!myId) return;

    const socket = await connectSocket(myId);
    socket.emit("join:conversation", id);

    socket.off("message:new");
    socket.on("message:new", (msg) => {
      if (msg.conversation === id || msg.conversation?._id === id) {
        setMessages((prev) => [...prev, msg]);
        socket.emit("message:seen", { messageId: msg._id, conversationId: id });
      }
    });

    socket.off("typing:action");
    socket.on("typing:action", ({ userId, conversationId, action }) => {
      if (conversationId === id && userId !== myId) {
        setTypingUser(userId);
        setTypingAction(action || "typing");
      }
    });

    socket.off("typing:start");
    socket.on("typing:start", ({ userId, conversationId }) => {
      if (conversationId === id && userId !== myId) {
        setTypingUser(userId);
        setTypingAction("typing");
      }
    });

    socket.off("typing:stop");
    socket.on("typing:stop", ({ conversationId }) => {
      if (conversationId === id) setTypingUser(null);
    });

    socket.off("message:seen");
    socket.on("message:seen", ({ messageId, userId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, seen: Array.from(new Set([...(m.seen || []), userId])) } : m
        )
      );
    });

    socket.off("message:reaction_updated");
    socket.on("message:reaction_updated", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.off("message:edited");
    socket.on("message:edited", ({ messageId, content, isEdited, editedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, content, isEdited, editedAt } : m))
      );
    });

    socket.off("message:deleted");
    socket.on("message:deleted", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true, content: "", mediaUrl: "" } : m))
      );
    });

    socket.off("message:pinned");
    socket.on("message:pinned", ({ message }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === message._id ? { ...m, isPinned: true } : m))
      );
      setConversation((prev) => (prev ? { ...prev, pinnedMessage: message } : prev));
    });

    socket.off("message:unpinned");
    socket.on("message:unpinned", () => {
      setMessages((prev) => prev.map((m) => ({ ...m, isPinned: false })));
      setConversation((prev) => (prev ? { ...prev, pinnedMessage: null } : prev));
    });
  }

  const handleTyping = (e) => {
    setText(e.target.value);
    const socket = getSocket();
    if (!socket) return;

    socket.emit("typing:action", { conversationId: id, action: "typing" });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: id });
    }, 2000);
  };

  const handleSend = () => {
    if (!text.trim()) return;

    if (editingMsg) {
      const socket = getSocket();
      socket?.emit("message:edit", {
        messageId: editingMsg._id,
        conversationId: id,
        content: text.trim(),
      });
      setEditingMsg(null);
      setText("");
      return;
    }

    const socket = getSocket();
    socket?.emit("message:send", {
      conversationId: id,
      content: text.trim(),
      type: "text",
      replyTo: replyingTo?._id || null,
    });

    setText("");
    setReplyingTo(null);
    socket?.emit("typing:stop", { conversationId: id });
  };

  const handleSendSticker = (stickerUrl) => {
    const socket = getSocket();
    socket?.emit("message:send", {
      conversationId: id,
      type: "sticker",
      mediaUrl: stickerUrl,
      replyTo: replyingTo?._id || null,
    });
    setShowStickerPicker(false);
    setReplyingTo(null);
  };

  const handleReact = (messageId, emoji) => {
    const socket = getSocket();
    socket?.emit("message:react", { messageId, conversationId: id, emoji });
  };

  const handlePin = (messageId) => {
    const socket = getSocket();
    const targetMsg = messages.find((m) => m._id === messageId);
    if (targetMsg?.isPinned) {
      socket?.emit("message:unpin", { conversationId: id });
    } else {
      socket?.emit("message:pin", { messageId, conversationId: id });
    }
  };

  const handleDelete = (messageId) => {
    const socket = getSocket();
    socket?.emit("message:delete", { messageId, conversationId: id });
  };

  const handleForward = (origId, targetIds) => {
    const socket = getSocket();
    socket?.emit("message:forward", {
      originalMessageId: origId,
      targetConversationIds: targetIds,
    });
  };

  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--tg-accent)]", "rounded-2xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-[var(--tg-accent)]", "rounded-2xl"), 2000);
    }
  };

  // Upload file (Photo, Audio, Doc)
  const handleFileUpload = async (e, type = "file") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setShowAttachMenu(false);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        const socket = getSocket();
        socket?.emit("message:send", {
          conversationId: id,
          type,
          mediaUrl: data.url,
          fileName: file.name,
          fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          replyTo: replyingTo?._id || null,
        });
        setReplyingTo(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Voice Note Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];

      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "voice.webm");

        try {
          const res = await fetch("/api/media", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const data = await res.json();
          if (data.url) {
            const socket = getSocket();
            socket?.emit("message:send", {
              conversationId: id,
              type: "audio",
              mediaUrl: data.url,
              replyTo: replyingTo?._id || null,
            });
            setReplyingTo(null);
          }
        } catch (e) {
          console.error(e);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      rec.start();
      mediaRecRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      const socket = getSocket();
      socket?.emit("typing:action", { conversationId: id, action: "recording_voice" });
    } catch (e) {
      alert("Microphone permission required for voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && recording) {
      mediaRecRef.current.stop();
      clearInterval(recordTimerRef.current);
      setRecording(false);
      const socket = getSocket();
      socket?.emit("typing:stop", { conversationId: id });
    }
  };

  const cancelRecording = () => {
    if (mediaRecRef.current && recording) {
      mediaRecRef.current.ondataavailable = null;
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stop();
      clearInterval(recordTimerRef.current);
      setRecording(false);
      const socket = getSocket();
      socket?.emit("typing:stop", { conversationId: id });
    }
  };

  const isSavedMessages = conversation?.isSavedMessages;
  const isGroup = conversation?.isGroup;
  const chatTitle = isSavedMessages
    ? "Saved Messages"
    : isGroup
    ? conversation?.groupName || "Group Chat"
    : other?.name || "Chat";

  const chatSubtitle = isSavedMessages
    ? "Personal cloud notes"
    : typingUser
    ? `${typingAction === "recording_voice" ? "recording audio..." : "typing..."}`
    : isGroup
    ? `${conversation?.participants?.length || 0} members`
    : other?.isOnline
    ? "online"
    : other?.lastSeen
    ? `last seen ${new Date(other.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "offline";

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--tg-bg)" }}>
      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* ── Telegram Top Bar ── */}
        <header
          className="flex items-center justify-between px-4 py-2.5 border-b z-20 shrink-0 shadow-sm"
          style={{
            background: "var(--tg-header)",
            borderColor: "var(--tg-border)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/chat"
              className="lg:hidden p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div
              onClick={() => setShowInfoDrawer(true)}
              className="flex items-center gap-3 cursor-pointer select-none"
            >
              <Avatar
                name={chatTitle}
                avatar={isSavedMessages ? null : isGroup ? conversation?.groupAvatar : other?.avatar}
                size={40}
                online={isSavedMessages || isGroup ? undefined : other?.isOnline}
                isSavedMessages={isSavedMessages}
                isGroup={isGroup}
              />

              <div className="min-w-0">
                <h2 className="font-bold text-sm text-[var(--tg-text)] truncate leading-snug">
                  {chatTitle}
                </h2>
                <p
                  className="text-xs truncate font-medium flex items-center gap-1.5"
                  style={{
                    color: typingUser
                      ? "var(--tg-accent)"
                      : other?.isOnline
                      ? "var(--tg-accent)"
                      : "var(--tg-text-muted)",
                  }}
                >
                  {typingUser && (
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-accent)] animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-accent)] animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-accent)] animate-bounce [animation-delay:0.4s]" />
                    </span>
                  )}
                  <span>{chatSubtitle}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Search inside chat */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Search in chat"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Audio & Video Call */}
            {!isSavedMessages && !isGroup && (
              <>
                <Link
                  href={`/call?peerId=${other?._id}&type=audio`}
                  className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
                  title="Audio Call"
                >
                  <Phone className="w-5 h-5" />
                </Link>
                <Link
                  href={`/call?peerId=${other?._id}&type=video`}
                  className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
                  title="Video Call"
                >
                  <Video className="w-5 h-5" />
                </Link>
              </>
            )}

            {/* Info Drawer Toggle */}
            <button
              onClick={() => setShowInfoDrawer(!showInfoDrawer)}
              className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Chat Info"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ── Telegram In-Chat Search Bar ── */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-2 border-b flex items-center justify-between gap-3 z-10"
              style={{
                background: "var(--tg-sidebar)",
                borderColor: "var(--tg-border)",
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-text-muted)]" />
                <input
                  autoFocus
                  placeholder="Search in this chat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--tg-bg)",
                    border: "1px solid var(--tg-border)",
                    color: "var(--tg-text)",
                  }}
                />
              </div>

              {searchMatches.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--tg-text-muted)] font-medium shrink-0">
                  <span>
                    {searchMatchIdx + 1} of {searchMatches.length}
                  </span>
                  <button
                    onClick={handlePrevSearch}
                    className="p-1 rounded hover:bg-white/10 text-[var(--tg-text)]"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextSearch}
                    className="p-1 rounded hover:bg-white/10 text-[var(--tg-text)]"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
                className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Telegram Pinned Message Banner ── */}
        {conversation?.pinnedMessage && (
          <div
            onClick={() => scrollToMessage(conversation.pinnedMessage._id || conversation.pinnedMessage)}
            className="flex items-center justify-between px-4 py-2 border-b cursor-pointer transition hover:opacity-95 z-10"
            style={{
              background: "var(--tg-sidebar)",
              borderColor: "var(--tg-border)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-1 h-7 rounded-full bg-[var(--tg-accent)] shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-[var(--tg-accent)] block uppercase tracking-wider">
                  Pinned Message
                </span>
                <p className="text-xs text-[var(--tg-text)] truncate opacity-90">
                  {conversation.pinnedMessage.content || "Media / Attachment"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePin(conversation.pinnedMessage._id);
              }}
              className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Unpin"
            >
              <PinOff className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        )}

        {/* ── Chat Messages Stream with Telegram Wallpaper ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 tg-chat-wallpaper">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div
                className="px-4 py-2 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md"
                style={{
                  background: "var(--tg-date-badge)",
                  color: "var(--tg-date-fg)",
                }}
              >
                {isSavedMessages ? "Your Cloud Storage" : "No messages here yet. Send a message to start!"}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const myId = me?.id || me?._id;
              const isMe = msg.sender?._id === myId || msg.sender === myId;

              // Date separator check
              const showDate =
                idx === 0 ||
                new Date(msg.createdAt).toDateString() !==
                  new Date(messages[idx - 1]?.createdAt).toDateString();

              return (
                <div key={msg._id || idx}>
                  {showDate && (
                    <div className="flex justify-center my-3 select-none">
                      <span
                        className="px-3.5 py-1 rounded-full text-[11px] font-semibold shadow-sm backdrop-blur-md"
                        style={{
                          background: "var(--tg-date-badge)",
                          color: "var(--tg-date-fg)",
                        }}
                      >
                        {new Date(msg.createdAt).toLocaleDateString([], {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}

                  <MessageBubble
                    msg={msg}
                    isMe={isMe}
                    myId={myId}
                    isGroup={isGroup}
                    onReply={(m) => {
                      setEditingMsg(null);
                      setReplyingTo(m);
                    }}
                    onReact={handleReact}
                    onEdit={(m) => {
                      setReplyingTo(null);
                      setEditingMsg(m);
                      setText(m.content || "");
                    }}
                    onDelete={handleDelete}
                    onPin={handlePin}
                    onForward={(m) => setForwardingMsg(m)}
                    onOpenMedia={(url) => setLightboxUrl(url)}
                    onScrollTo={scrollToMessage}
                  />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Telegram Reply / Edit Bar ── */}
        <AnimatePresence>
          {(replyingTo || editingMsg) && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="px-4 py-2 border-t flex items-center justify-between gap-3 z-10"
              style={{
                background: "var(--tg-sidebar)",
                borderColor: "var(--tg-border)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-1 h-8 rounded-full bg-[var(--tg-accent)] shrink-0" />
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[var(--tg-accent)] block flex items-center gap-1">
                    {editingMsg ? (
                      <>
                        <Pencil className="w-3 h-3" /> Edit Message
                      </>
                    ) : (
                      <>
                        <Reply className="w-3 h-3" /> Reply to {replyingTo?.sender?.name || "User"}
                      </>
                    )}
                  </span>
                  <p className="text-xs text-[var(--tg-text)] truncate opacity-85">
                    {editingMsg ? editingMsg.content : replyingTo?.content || "Media"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setEditingMsg(null);
                  if (editingMsg) setText("");
                }}
                className="p-1 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Telegram Input Bar ── */}
        <footer
          className="p-3 border-t flex items-center gap-2 relative z-20 shadow-md"
          style={{
            background: "var(--tg-input-bg)",
            borderColor: "var(--tg-border)",
          }}
        >
          {/* Attachment Paperclip Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-accent)] hover:bg-white/10 transition"
              title="Attach File"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Telegram Attachment Menu Popup */}
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-14 left-0 w-52 rounded-2xl p-1.5 shadow-2xl border flex flex-col gap-1 z-40"
                  style={{
                    background: "var(--tg-card)",
                    borderColor: "var(--tg-border)",
                    boxShadow: "var(--tg-shadow-lg)",
                  }}
                >
                  {/* Photo / Video */}
                  <label className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition text-sm text-[var(--tg-text)]">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Photo / Video</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      ref={imageRef}
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, "image")}
                    />
                  </label>

                  {/* Document */}
                  <label className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition text-sm text-[var(--tg-text)]">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <FileIcon className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Document</span>
                    <input
                      type="file"
                      ref={fileRef}
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, "file")}
                    />
                  </label>

                  {/* Audio File */}
                  <label className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition text-sm text-[var(--tg-text)]">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Audio Music</span>
                    <input
                      type="file"
                      accept="audio/*"
                      ref={audioRef}
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, "audio")}
                    />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Voice Recording Mode Bar */}
          {recording ? (
            <div className="flex-1 flex items-center justify-between px-4 py-2 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 tg-recording-pulse" />
                <span className="text-sm font-semibold font-mono">
                  {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, "0")}
                </span>
                <span className="text-xs text-[var(--tg-text-muted)]">Recording Voice Note...</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="p-1.5 rounded-full hover:bg-red-500/20 text-red-400 transition"
                  title="Cancel Recording"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-3 py-1 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-bold shadow-md hover:bg-[var(--tg-accent-hover)] transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Message Text Input */}
              <input
                type="text"
                placeholder={uploading ? "Uploading media..." : "Write a message..."}
                disabled={uploading}
                value={text}
                onChange={handleTyping}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-2xl text-sm outline-none transition"
                style={{
                  background: "var(--tg-card)",
                  border: "1px solid var(--tg-border)",
                  color: "var(--tg-text)",
                }}
              />

              {/* Emoji & Sticker Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStickerPicker(!showStickerPicker)}
                  className="p-2.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-accent)] hover:bg-white/10 transition"
                  title="Emoji & Stickers"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {showStickerPicker && (
                  <StickerPicker
                    onSelectEmoji={(emoji) => setText((prev) => prev + emoji)}
                    onSelectSticker={handleSendSticker}
                    onClose={() => setShowStickerPicker(false)}
                  />
                )}
              </div>

              {/* Telegram Morphing Button: Send plane or Mic */}
              {text.trim() || editingMsg ? (
                <button
                  type="button"
                  onClick={handleSend}
                  className="w-10 h-10 rounded-full bg-[var(--tg-accent)] text-white flex items-center justify-center shadow-lg hover:bg-[var(--tg-accent-hover)] transition active:scale-95 shrink-0"
                  title="Send Message"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-10 h-10 rounded-full bg-[var(--tg-card)] text-[var(--tg-accent)] flex items-center justify-center shadow-md hover:bg-white/10 transition active:scale-95 shrink-0 border border-[var(--tg-border)]"
                  title="Record Voice Note"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </footer>
      </div>

      {/* ── Telegram Chat Info Drawer (Slide out right) ── */}
      <ChatInfoDrawer
        isOpen={showInfoDrawer}
        onClose={() => setShowInfoDrawer(false)}
        conversation={conversation}
        otherUser={other}
        messages={messages}
        me={me}
        onStartCall={(type) => router.push(`/call?peerId=${other?._id}&type=${type}`)}
        onOpenMedia={(url) => setLightboxUrl(url)}
      />

      {/* ── Telegram Fullscreen Media Lightbox ── */}
      {lightboxUrl && (
        <MediaLightbox
          src={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}

      {/* ── Telegram Forward Message Modal ── */}
      {forwardingMsg && (
        <ForwardModal
          message={forwardingMsg}
          conversations={allConvos}
          me={me}
          onForward={handleForward}
          onClose={() => setForwardingMsg(null)}
        />
      )}
    </div>
  );
}