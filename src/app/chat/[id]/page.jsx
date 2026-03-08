"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Send, Paperclip, Phone, Video, MoreVertical,
  Check, CheckCheck, File as FileIcon, Mic, Loader2, Play, Pause, Download
} from "lucide-react";
import Link from "next/link";
import { connectSocket, getSocket } from "@/lib/socket";

function Avatar({ name, avatar, size = 36, online }) {
  return (
    <div className="relative shrink-0" style={{ width:size, height:size }}>
      {avatar
        ? <img src={avatar} className="rounded-full w-full h-full object-cover" alt={name} />
        : <div className="rounded-full w-full h-full flex items-center justify-center font-bold text-white"
            style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)", fontSize:size*0.38 }}>
            {name?.[0]?.toUpperCase() || "?"}
          </div>}
      {online !== undefined && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
          style={{ background:online?"var(--success)":"var(--fg-subtle)", borderColor:"var(--bg-2)" }} />
      )}
    </div>
  );
}

function MessageBubble({ msg, isMe }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      className={`flex items-end gap-2 ${isMe?"justify-end":"justify-start"}`}>
      {!isMe && <Avatar name={msg.sender?.name} avatar={msg.sender?.avatar} size={28} />}
      <div className="max-w-xs lg:max-w-md xl:max-w-lg">
        <div className="px-4 py-2.5 rounded-2xl"
          style={{
            background:              isMe?"var(--bubble-me)":"var(--bubble-them)",
            color:                   isMe?"var(--bubble-me-fg)":"var(--bubble-them-fg)",
            borderBottomRightRadius: isMe?4:undefined,
            borderBottomLeftRadius:  !isMe?4:undefined,
          }}>
          {msg.type === "image" && (
            <img src={msg.mediaUrl} alt="img" className="rounded-xl max-w-full mb-1" style={{ maxHeight:260 }} />
          )}
          {msg.type === "audio" && (
            <div className="flex items-center gap-3 min-w-32">
              <button onClick={() => { playing?audioRef.current?.pause():audioRef.current?.play(); setPlaying(p=>!p); }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background:"rgba(255,255,255,0.2)" }}>
                {playing?<Pause className="w-3.5 h-3.5"/>:<Play className="w-3.5 h-3.5"/>}
              </button>
              <div className="flex-1 h-1 rounded-full" style={{ background:"rgba(255,255,255,0.3)" }} />
              <audio ref={audioRef} src={msg.mediaUrl} onEnded={()=>setPlaying(false)} />
            </div>
          )}
          {msg.type === "file" && (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm">
              <FileIcon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-32">{msg.fileName||"File"}</span>
              <Download className="w-3.5 h-3.5 shrink-0" />
            </a>
          )}
          {(msg.type==="text"||!msg.type) && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMe?"justify-end":"justify-start"}`}>
          <span className="text-xs" style={{ color:"var(--fg-subtle)" }}>
            {new Date(msg.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
          </span>
          {isMe && (msg.seen?.length>0
            ?<CheckCheck className="w-3.5 h-3.5" style={{ color:"#06b6d4" }}/>
            :<Check className="w-3.5 h-3.5" style={{ color:"var(--fg-subtle)" }}/>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const id     = params?.id;
  const router = useRouter();

  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState("");
  const [typing,    setTyping]    = useState(false);
  const [other,     setOther]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const [token,     setToken]     = useState("");
  const [me,        setMe]        = useState({});

  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const mediaRecRef = useRef(null);
  const fileRef     = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem("token") || "";
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!t) { router.push("/login"); return; }
    setToken(t); setMe(u); setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !token || !id) return;
    loadMessages();
    initSocket();
    return () => {
      // Remove conversation-specific listeners only
      const socket = getSocket();
      if (socket) {
        socket.off("message:new");
        socket.off("typing:start");
        socket.off("typing:stop");
        socket.off("message:seen");
      }
    };
  }, [mounted, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, typing]);

  async function loadMessages() {
    try {
      const [msgRes, convoRes] = await Promise.all([
        fetch(`/api/messages?conversationId=${id}`,{ headers:{ Authorization:`Bearer ${token}` } }),
        fetch("/api/conversations",                  { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      const msgData   = await msgRes.json();
      const convoData = await convoRes.json();
      setMessages(msgData.messages || []);
      const convo = convoData.conversations?.find(c => c._id === id);
      if (convo) setOther(convo.participants?.find(p => p._id !== (me?.id||me?._id)));
    } catch (err) { console.error("Load error:", err); }
  }

  async function initSocket() {
    const myId   = me?.id || me?._id;
    // ✅ Reuse shared socket
    const socket = await connectSocket(myId);

    // Join this conversation room
    socket.emit("join:conversation", id);

    // Remove old listeners first
    socket.off("message:new");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("message:seen");

    socket.on("message:new", msg => {
      setMessages(m => [...m, msg]);
    });

    socket.on("typing:start", data => {
      if (data.conversationId === id) setTyping(true);
    });

    socket.on("typing:stop", data => {
      if (data.conversationId === id) setTyping(false);
    });

    socket.on("message:seen", ({ messageId, userId }) => {
      setMessages(msgs => msgs.map(m =>
        m._id === messageId ? { ...m, seen:[...(m.seen||[]), userId] } : m
      ));
    });
  }

  function sendMessage() {
    if (!text.trim()) return;
    const socket = getSocket();
    socket?.emit("message:send", { conversationId:id, content:text, type:"text" });
    setText("");
    socket?.emit("typing:stop", { conversationId:id });
  }

  function handleTyping(e) {
    setText(e.target.value);
    const socket = getSocket();
    socket?.emit("typing:start", { conversationId:id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() =>
      socket?.emit("typing:stop", { conversationId:id }), 1500);
  }

  async function uploadFile(file) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/media", {
        method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:form,
      });
      const data = await res.json();
      const type = file.type.startsWith("image")?"image":file.type.startsWith("audio")?"audio":"file";
      const socket = getSocket();
      socket?.emit("message:send", {
        conversationId:id, content:"", type, mediaUrl:data.url, fileName:file.name,
      });
    } catch (err) { console.error("Upload error:", err); }
    finally { setUploading(false); }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecRef.current?.stop(); setRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        const rec    = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          const blob = new Blob(chunks, { type:"audio/webm" });
          uploadFile(new window.File([blob], "voice.webm", { type:"audio/webm" }));
          stream.getTracks().forEach(t => t.stop());
        };
        rec.start();
        mediaRecRef.current = rec;
        setRecording(true);
      } catch (err) { console.error("Mic error:", err); }
    }
  }

  if (!mounted) return (
    <div className="flex h-screen items-center justify-center" style={{ background:"var(--bg)" }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent spin"
        style={{ borderColor:"var(--primary)" }} />
    </div>
  );

  const myId = me?.id || me?._id;

  return (
    <div className="flex flex-col h-screen" style={{ background:"var(--bg)" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ background:"var(--bg-2)", borderColor:"var(--border)" }}>
        <button onClick={() => router.push("/chat")} className="lg:hidden p-1"
          style={{ color:"var(--fg-muted)" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        {other && <Avatar name={other.name} avatar={other.avatar} size={38} online={other.isOnline} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color:"var(--fg)" }}>
            {other?.name || "Chat"}
          </p>
          <p className="text-xs" style={{
            color: typing?"var(--primary)":other?.isOnline?"var(--success)":"var(--fg-subtle)"
          }}>
            {typing?"typing...":other?.isOnline?"Online":"Offline"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/call?userId=${other?._id}&type=voice`}
            className="w-9 h-9 rounded-full flex items-center justify-center transition"
            style={{ color:"var(--fg-muted)" }}>
            <Phone className="w-4 h-4" />
          </Link>
          <Link href={`/call?userId=${other?._id}&type=video`}
            className="w-9 h-9 rounded-full flex items-center justify-center transition"
            style={{ color:"var(--fg-muted)" }}>
            <Video className="w-4 h-4" />
          </Link>
          <button className="w-9 h-9 rounded-full flex items-center justify-center transition"
            style={{ color:"var(--fg-muted)" }}>
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <MessageBubble key={msg._id} msg={msg}
            isMe={msg.sender?._id===myId||msg.sender===myId} />
        ))}
        {typing && (
          <div className="flex items-end gap-2">
            {other && <Avatar name={other.name} avatar={other.avatar} size={28} />}
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm" style={{ background:"var(--bubble-them)" }}>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full"
                    style={{ background:"var(--fg-muted)", animation:"bounce3 1.2s ease infinite", animationDelay:`${i*0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-3 border-t" style={{ background:"var(--bg-2)", borderColor:"var(--border)" }}>
        <input ref={fileRef} type="file" className="hidden"
          onChange={e => e.target.files[0] && uploadFile(e.target.files[0])} />
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition"
            style={{ color:"var(--fg-muted)", background:"var(--bg-hover)" }}>
            {uploading?<Loader2 className="w-4 h-4 spin"/>:<Paperclip className="w-4 h-4"/>}
          </button>
          <textarea rows={1} placeholder="Type a message..."
            value={text} onChange={handleTyping}
            onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} }}
            className="flex-1 px-4 py-2.5 rounded-2xl text-sm resize-none"
            style={{ maxHeight:120, lineHeight:1.5 }} />
          {text.trim()
            ?<motion.button onClick={sendMessage} whileTap={{ scale:0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white"
                style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
                <Send className="w-4 h-4"/>
              </motion.button>
            :<button onClick={toggleRecording}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white transition"
                style={{ background:recording?"var(--danger)":"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
                <Mic className="w-4 h-4"/>
              </button>
          }
        </div>
      </div>
    </div>
  );
}