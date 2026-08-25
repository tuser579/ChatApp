"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Check, CheckCheck, File as FileIcon, Mic, Loader2, Play, Pause,
  Download, ExternalLink, Smile, Reply, Pencil, Trash2, X
} from "lucide-react";
import Link from "next/link";
import { connectSocket, getSocket } from "@/lib/socket";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function Avatar({ name, avatar, size = 36, online }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatar ? (
        <img src={avatar} className="rounded-full w-full h-full object-cover" alt={name || "User"} />
      ) : (
        <div
          className="rounded-full w-full h-full flex items-center justify-center font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)", fontSize: size * 0.38 }}
        >
          {name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
      {online !== undefined && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
          style={{ background: online ? "var(--success)" : "var(--fg-subtle)", borderColor: "var(--bg-2)" }}
        />
      )}
    </div>
  );
}

function AudioPlayer({ src }) {
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

  return (
    <div className="flex items-center gap-2.5 py-1 min-w-[210px] max-w-full">
      <button
        onClick={() => {
          if (playing) {
            audioRef.current?.pause();
          } else {
            audioRef.current?.play();
          }
          setPlaying(!playing);
        }}
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm"
        style={{ background: "rgba(255,255,255,0.22)" }}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          className="w-full h-1.5 rounded-full overflow-hidden cursor-pointer"
          style={{ background: "rgba(255,255,255,0.25)" }}
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pos * duration;
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{ width: `${progress}%`, background: "white" }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-medium opacity-80 select-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        onClick={toggleSpeed}
        className="text-[11px] font-bold px-1.5 py-0.5 rounded-md transition-colors hover:bg-white/30"
        style={{ background: "rgba(255,255,255,0.2)" }}
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

function MessageBubble({ msg, isMe, myId, onReply, onReact, onEdit, onDelete, onScrollTo }) {
  const [showPopup, setShowPopup] = useState(false);

  // Group reactions by emoji
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
    if (reply.isDeleted) return "This message was deleted";
    if (reply.type === "image") return "📷 Photo";
    if (reply.type === "audio") return "🎵 Voice message";
    if (reply.type === "file") return `📄 ${reply.fileName || "File"}`;
    return reply.content || "";
  };

  return (
    <div
      id={`msg-${msg._id}`}
      className={`group relative flex items-end gap-2 my-2.5 pt-3 ${isMe ? "justify-end" : "justify-start"}`}
    >
      {!isMe && <Avatar name={msg.sender?.name} avatar={msg.sender?.avatar} size={28} />}

      <div className={`relative max-w-[85%] sm:max-w-md lg:max-w-lg flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        
        {/* Floating Action Pill Bar: Absolutely positioned above the bubble (No Layout Shift) */}
        {!msg.isDeleted && (
          <div
            className={`absolute -top-5.5 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-150 ${
              showPopup
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 group-hover:opacity-100 pointer-events-auto"
            } ${isMe ? "right-1" : "left-1"}`}
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            }}
          >
            {/* Quick Emoji Reactions */}
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(msg._id, emoji);
                  setShowPopup(false);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-135 transition-transform text-sm hover:bg-white/10"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}

            <div className="w-[1px] h-3.5 mx-0.5" style={{ background: "var(--border)" }} />

            {/* Reply */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReply(msg);
                setShowPopup(false);
              }}
              className="p-1 rounded-full hover:bg-white/10 transition"
              style={{ color: "var(--fg-muted)" }}
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            {/* Edit */}
            {isMe && msg.type === "text" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(msg);
                  setShowPopup(false);
                }}
                className="p-1 rounded-full hover:bg-white/10 transition"
                style={{ color: "var(--fg-muted)" }}
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
                  setShowPopup(false);
                }}
                className="p-1 rounded-full hover:bg-red-500/20 text-red-400 transition"
                title="Delete for everyone"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Message Bubble Body */}
        <div
          onClick={() => setShowPopup(!showPopup)}
          className="px-4 py-2.5 rounded-2xl relative shadow-sm transition-all cursor-pointer select-text"
          style={{
            background: msg.isDeleted
              ? "var(--bg-hover)"
              : isMe
              ? "var(--bubble-me)"
              : "var(--bubble-them)",
            color: msg.isDeleted
              ? "var(--fg-muted)"
              : isMe
              ? "var(--bubble-me-fg)"
              : "var(--bubble-them-fg)",
            borderBottomRightRadius: isMe ? 4 : undefined,
            borderBottomLeftRadius: !isMe ? 4 : undefined,
            border: msg.isDeleted ? "1px dashed var(--border)" : "none",
          }}
        >
          {/* Quoted Message Quote Box */}
          {msg.replyTo && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onScrollTo(msg.replyTo._id);
              }}
              className="mb-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border-l-4 transition hover:opacity-90 flex flex-col gap-0.5"
              style={{
                background: "rgba(0,0,0,0.18)",
                borderLeftColor: isMe ? "#ffffff" : "var(--primary)",
                color: isMe ? "rgba(255,255,255,0.95)" : "var(--fg)",
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

          {/* Deleted Message State */}
          {msg.isDeleted ? (
            <p className="text-xs italic flex items-center gap-1.5 py-0.5 opacity-80">
              <span>🚫 This message was deleted</span>
            </p>
          ) : (
            <>
              {/* Image Type */}
              {msg.type === "image" && (
                <div className="relative group/img">
                  <img
                    src={msg.mediaUrl}
                    alt="img"
                    className="rounded-xl max-w-full mb-1 object-cover"
                    style={{ maxHeight: 260 }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(msg.mediaUrl, "_blank");
                    }}
                    className="absolute bottom-2 right-2 p-1.5 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1.5 text-xs font-semibold backdrop-blur-md shadow-md"
                    style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </button>
                </div>
              )}

              {/* Audio / Voice Note Type */}
              {msg.type === "audio" && <AudioPlayer src={msg.mediaUrl} />}

              {/* File / Document Type */}
              {msg.type === "file" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(msg.mediaUrl, "_blank");
                  }}
                  className="flex items-center gap-2.5 text-sm hover:opacity-85 transition py-1"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                  >
                    <FileIcon className="w-4 h-4" />
                  </div>
                  <span className="truncate max-w-[160px] text-left font-medium">
                    {msg.fileName || "Document"}
                  </span>
                  <Download className="w-4 h-4 shrink-0 opacity-80" />
                </button>
              )}

              {/* Text Type */}
              {(msg.type === "text" || !msg.type) && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              )}
            </>
          )}
        </div>

        {/* Bottom Metadata: Timestamp, Status Ticks, Edited Flag */}
        <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
          {msg.isEdited && !msg.isDeleted && (
            <span className="text-[10px] italic" style={{ color: "var(--fg-subtle)" }}>
              (edited)
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isMe && !msg.isDeleted && (
            msg.seen?.length > 0 ? (
              <CheckCheck className="w-3.5 h-3.5" style={{ color: "#06b6d4" }} />
            ) : (
              <Check className="w-3.5 h-3.5" style={{ color: "var(--fg-subtle)" }} />
            )
          )}
        </div>

        {/* Reaction Badges Pill Bar */}
        {Object.keys(reactionCounts).length > 0 && !msg.isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(msg._id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95 ${
                  data.hasReacted ? "ring-1 ring-primary/40 shadow-sm" : ""
                }`}
                style={{
                  background: data.hasReacted ? "var(--bg-active)" : "var(--bg-card)",
                  borderColor: data.hasReacted ? "var(--primary)" : "var(--border)",
                  color: "var(--fg)",
                }}
                title={data.hasReacted ? "Click to remove reaction" : "Click to react"}
              >
                <span>{emoji}</span>
                {data.count > 1 && <span className="text-[11px] opacity-85">{data.count}</span>}
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

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState("");
  const [me, setMe] = useState({});

  // WhatsApp-style interactions
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const mediaRecRef = useRef(null);
  const recordTimerRef = useRef(null);
  const fileRef = useRef(null);

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
        socket.off("message:seen");
        socket.off("message:reaction_updated");
        socket.off("message:edited");
        socket.off("message:deleted");
      }
    };
  }, [mounted, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing]);

  async function loadMessages() {
    try {
      const [msgRes, convoRes] = await Promise.all([
        fetch(`/api/messages?conversationId=${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const msgData = await msgRes.json();
      const convoData = await convoRes.json();
      setMessages(msgData.messages || []);
      const convo = convoData.conversations?.find((c) => c._id === id);
      if (convo) setOther(convo.participants?.find((p) => p._id !== (me?.id || me?._id)));
    } catch (err) {
      console.error("Load error:", err);
    }
  }

  async function initSocket() {
    // Read userId directly from localStorage — don't rely on me state
    // which may not have updated in the same render cycle
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = u?.id || u?._id;
    if (!myId) { console.error("❌ initSocket: no userId"); return; }

    const socket = await connectSocket(myId);
    console.log("🔌 Socket connected, joining room:", id);

    // Clean up old listeners first
    socket.off("message:new");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("message:seen");
    socket.off("message:reaction_updated");
    socket.off("message:edited");
    socket.off("message:deleted");

    // THEN join the room (after listeners are set up)
    socket.emit("join:conversation", id);

    socket.on("message:new", (msg) => {
      // Use String() comparison to handle both ObjectId and plain string formats
      const msgConvoId = String(msg.conversation?._id || msg.conversation || "");
      if (msgConvoId === String(id)) {
        setMessages((m) => [...m, msg]);
      }
    });

    socket.on("typing:start", (data) => {
      if (data.conversationId === id) setTyping(true);
    });

    socket.on("typing:stop", (data) => {
      if (data.conversationId === id) setTyping(false);
    });

    socket.on("message:seen", ({ messageId, userId }) => {
      setMessages((msgs) =>
        msgs.map((m) => (m._id === messageId ? { ...m, seen: [...(m.seen || []), userId] } : m))
      );
    });

    socket.on("message:reaction_updated", ({ messageId, reactions }) => {
      setMessages((msgs) =>
        msgs.map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.on("message:edited", ({ messageId, content, isEdited, editedAt }) => {
      setMessages((msgs) =>
        msgs.map((m) => (m._id === messageId ? { ...m, content, isEdited, editedAt } : m))
      );
    });

    socket.on("message:deleted", ({ messageId }) => {
      setMessages((msgs) =>
        msgs.map((m) =>
          m._id === messageId
            ? { ...m, isDeleted: true, content: "", mediaUrl: "", fileName: "", reactions: [] }
            : m
        )
      );
    });
  }

  function sendMessage() {
    if (!text.trim()) return;
    const socket = getSocket();

    if (editingMsg) {
      socket?.emit("message:edit", {
        messageId: editingMsg._id,
        conversationId: id,
        content: text.trim(),
      });
      setEditingMsg(null);
      setText("");
      return;
    }

    socket?.emit("message:send", {
      conversationId: id,
      content: text.trim(),
      type: "text",
      replyTo: replyingTo ? replyingTo._id : null,
    });

    setText("");
    setReplyingTo(null);
    socket?.emit("typing:stop", { conversationId: id });
  }

  function handleTyping(e) {
    setText(e.target.value);
    const socket = getSocket();
    socket?.emit("typing:start", { conversationId: id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socket?.emit("typing:stop", { conversationId: id }),
      1500
    );
  }

  function handleReact(messageId, emoji) {
    const socket = getSocket();
    socket?.emit("message:react", { messageId, conversationId: id, emoji });
  }

  function handleReply(msg) {
    setEditingMsg(null);
    setReplyingTo(msg);
  }

  function handleEdit(msg) {
    setReplyingTo(null);
    setEditingMsg(msg);
    setText(msg.content || "");
  }

  function handleDelete(messageId) {
    if (!window.confirm("Delete this message for everyone?")) return;
    const socket = getSocket();
    socket?.emit("message:delete", { messageId, conversationId: id });
  }

  function scrollToMessage(messageId) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "rounded-2xl");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "rounded-2xl");
      }, 1800);
    }
  }

  async function uploadFile(file) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      const type = file.type.startsWith("image")
        ? "image"
        : file.type.startsWith("audio")
        ? "audio"
        : "file";
      const socket = getSocket();
      socket?.emit("message:send", {
        conversationId: id,
        content: "",
        type,
        mediaUrl: data.url,
        fileName: file.name,
        replyTo: replyingTo ? replyingTo._id : null,
      });
      setReplyingTo(null);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];

      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        if (chunks.length > 0 && rec.shouldSend) {
          const blob = new Blob(chunks, { type: "audio/webm" });
          uploadFile(new window.File([blob], "voice.webm", { type: "audio/webm" }));
        }
        stream.getTracks().forEach((t) => t.stop());
      };

      rec.start();
      rec.shouldSend = true;
      mediaRecRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Could not access microphone.");
    }
  }

  function stopAndSendRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecRef.current) {
      mediaRecRef.current.shouldSend = true;
      mediaRecRef.current.stop();
    }
    setRecording(false);
    setRecordSeconds(0);
  }

  function cancelRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecRef.current) {
      mediaRecRef.current.shouldSend = false;
      mediaRecRef.current.stop();
    }
    setRecording(false);
    setRecordSeconds(0);
  }

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent spin" style={{ borderColor: "var(--primary)" }} />
      </div>
    );
  }

  const myId = me?.id || me?._id;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg)" }}>

      {/* Chat Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shadow-sm z-10"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => router.push("/chat")}
          className="lg:hidden p-1.5 rounded-full hover:bg-white/5 transition"
          style={{ color: "var(--fg-muted)" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {other && <Avatar name={other.name} avatar={other.avatar} size={38} online={other.isOnline} />}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "var(--fg)" }}>
            {other?.name || "Chat"}
          </p>
          <p
            className="text-xs"
            style={{
              color: typing ? "var(--primary)" : other?.isOnline ? "var(--success)" : "var(--fg-subtle)",
            }}
          >
            {typing ? "typing..." : other?.isOnline ? "Online" : "Offline"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={`/call?userId=${other?._id}&type=voice`}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/5"
            style={{ color: "var(--fg-muted)" }}
            title="Voice Call"
          >
            <Phone className="w-4 h-4" />
          </Link>
          <Link
            href={`/call?userId=${other?._id}&type=video`}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/5"
            style={{ color: "var(--fg-muted)" }}
            title="Video Call"
          >
            <Video className="w-4 h-4" />
          </Link>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/5"
            style={{ color: "var(--fg-muted)" }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg._id}
            msg={msg}
            isMe={msg.sender?._id === myId || msg.sender === myId}
            myId={myId}
            onReply={handleReply}
            onReact={handleReact}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onScrollTo={scrollToMessage}
          />
        ))}

        {typing && (
          <div className="flex items-end gap-2">
            {other && <Avatar name={other.name} avatar={other.avatar} size={28} />}
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm" style={{ background: "var(--bubble-them)" }}>
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: "var(--fg-muted)",
                      animation: "bounce3 1.2s ease infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Active Replying / Editing Banner */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="px-4 py-2 border-t flex items-center justify-between gap-3 shadow-inner"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0 border-l-4 border-primary pl-2.5">
              <Reply className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary truncate">
                  Replying to {replyingTo.sender?.name || "User"}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--fg-muted)" }}>
                  {replyingTo.content || (replyingTo.type === "image" ? "Photo" : replyingTo.type === "audio" ? "Voice message" : "Attachment")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 rounded-full hover:bg-white/10 transition"
              style={{ color: "var(--fg-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {editingMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="px-4 py-2 border-t flex items-center justify-between gap-3 shadow-inner"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0 border-l-4 border-amber-500 pl-2.5">
              <Pencil className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-500">Editing message</p>
                <p className="text-xs truncate" style={{ color: "var(--fg-muted)" }}>
                  {editingMsg.content}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMsg(null);
                setText("");
              }}
              className="p-1 rounded-full hover:bg-white/10 transition"
              style={{ color: "var(--fg-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div className="px-3 py-3 border-t relative" style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />

        {recording ? (
          /* Live Voice Recording UI */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-2xl"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <span className="text-sm font-semibold tracking-wider text-red-500">
                {formatTimer(recordSeconds)}
              </span>
              <span className="text-xs opacity-75 hidden sm:inline" style={{ color: "var(--fg-muted)" }}>
                Recording voice note...
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 rounded-full hover:bg-red-500/10 text-red-500 transition"
                title="Cancel"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <motion.button
                type="button"
                onClick={stopAndSendRecording}
                whileTap={{ scale: 0.92 }}
                className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold text-white shadow-md"
                style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          /* Standard Message Input Bar */
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition hover:scale-105 active:scale-95"
              style={{ color: "var(--fg-muted)", background: "var(--bg-hover)" }}
              title="Attach File or Media"
            >
              {uploading ? <Loader2 className="w-4 h-4 spin" /> : <Paperclip className="w-4 h-4" />}
            </button>

            <textarea
              rows={1}
              placeholder={editingMsg ? "Edit your message..." : "Type a message..."}
              value={text}
              onChange={handleTyping}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              className="flex-1 px-4 py-2.5 rounded-2xl text-sm resize-none"
              style={{ maxHeight: 120, lineHeight: 1.5 }}
            />

            {text.trim() ? (
              <motion.button
                type="button"
                onClick={sendMessage}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white shadow-md transition-transform"
                style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                title={editingMsg ? "Save edit" : "Send"}
              >
                {editingMsg ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </motion.button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white transition hover:scale-105 active:scale-95 shadow-md"
                style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                title="Record Voice Note"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}