"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Search, Sun, Moon, Plus, X,
  LogOut, User, Settings
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import IncomingCallAlert from "@/components/IncomingCallAlert";
import { connectSocket } from "@/lib/socket";

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

export default function ChatLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [mounted,   setMounted]   = useState(false);
  const [token,     setToken]     = useState("");
  const [me,        setMe]        = useState({});
  const [convos,    setConvos]    = useState([]);
  const [search,    setSearch]    = useState("");
  const [users,     setUsers]     = useState([]);
  const [showNew,   setShowNew]   = useState(false);
  const [showMenu,  setShowMenu]  = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("token") || "";
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!t) { router.push("/login"); return; }
    setToken(t);
    setMe(u);
    setMounted(true);
    fetchConvos(t);

    // ✅ Connect socket once here — persistent for entire session
    const myId = u?.id || u?._id;
    if (myId) {
      connectSocket(myId).then(socket => {
        console.log("💬 Chat layout socket connected:", socket.id);
      });
    }
  }, []);

  useEffect(() => {
    if (!mounted || !token) return;
    fetchConvos(token);
  }, [pathname]);

  async function fetchConvos(t) {
    try {
      const res  = await fetch("/api/conversations", {
        headers: { Authorization:`Bearer ${t}` }
      });
      const data = await res.json();
      setConvos(data.conversations || []);
    } catch {}
  }

  async function searchUsers(q) {
    setSearch(q);
    if (!q.trim()) { setUsers([]); return; }
    setSearching(true);
    try {
      const res  = await fetch(`/api/users?search=${encodeURIComponent(q)}`, {
        headers: { Authorization:`Bearer ${token}` }
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch {}
    finally { setSearching(false); }
  }

  async function startConvo(userId) {
    try {
      const res  = await fetch("/api/conversations", {
        method:  "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:    JSON.stringify({ participantId: userId }),
      });
      const data = await res.json();
      setShowNew(false); setSearch(""); setUsers([]);
      await fetchConvos(token);
      router.push(`/chat/${data.conversation._id}`);
    } catch {}
  }

  function logout() {
    localStorage.clear();
    router.push("/login");
  }

  function getOther(convo) {
    const myId = me?.id || me?._id;
    return convo.participants?.find(
      p => p._id !== myId && String(p._id) !== String(myId)
    );
  }

  function formatTime(date) {
    if (!date) return "";
    const d    = new Date(date);
    const diff = Date.now() - d;
    if (diff < 60000)    return "now";
    if (diff < 3600000)  return `${Math.floor(diff/60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    return d.toLocaleDateString([], { month:"short", day:"numeric" });
  }

  const activeId = pathname.split("/chat/")[1];

  if (!mounted) return (
    <div className="flex h-screen items-center justify-center" style={{ background:"var(--bg)" }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent spin"
        style={{ borderColor:"var(--primary)" }} />
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:"var(--bg)" }}>

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col shrink-0 border-r transition-all
        ${activeId ? "hidden lg:flex" : "flex"}
        w-full lg:w-80 xl:w-96`}
        style={{ background:"var(--bg-2)", borderColor:"var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor:"var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base"
              style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
              NexChat
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={toggleTheme}
              className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110"
              style={{ color:"var(--fg-muted)" }}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowNew(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110"
              style={{ color:"var(--fg-muted)" }}>
              <Plus className="w-4 h-4" />
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(m => !m)}>
                <Avatar name={me?.name} avatar={me?.avatar} size={32} />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity:0, scale:0.9, y:-4 }}
                    animate={{ opacity:1, scale:1,   y:0  }}
                    exit={{   opacity:0, scale:0.9, y:-4  }}
                    className="absolute right-0 top-10 w-44 rounded-2xl py-1 z-50"
                    style={{ background:"var(--bg-card)", border:"1px solid var(--border)", boxShadow:"var(--shadow-lg)" }}>
                    <Link href="/profile" onClick={() => setShowMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)]"
                      style={{ color:"var(--fg)" }}>
                      <User className="w-4 h-4" /> Profile
                    </Link>
                    <Link href="/profile" onClick={() => setShowMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)]"
                      style={{ color:"var(--fg)" }}>
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                    <div className="my-1 border-t" style={{ borderColor:"var(--border)" }} />
                    <button onClick={logout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-hover)]"
                      style={{ color:"var(--danger)" }}>
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color:"var(--fg-subtle)" }} />
            <input placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm"
              style={{ background:"var(--bg)", border:"1px solid var(--border)", color:"var(--fg)" }} />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {convos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background:"rgba(99,102,241,0.1)" }}>
                <MessageCircle className="w-7 h-7" style={{ color:"var(--primary)" }} />
              </div>
              <p className="text-sm font-medium text-center" style={{ color:"var(--fg-muted)" }}>
                No conversations yet.<br />Click + to start one.
              </p>
            </div>
          ) : convos.map(convo => {
            const other    = getOther(convo);
            const isActive = convo._id === activeId;
            return (
              <Link key={convo._id} href={`/chat/${convo._id}`}>
                <motion.div whileHover={{ x:2 }}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors"
                  style={{ background:isActive ? "var(--bg-active)" : "transparent" }}>
                  <Avatar name={other?.name} avatar={other?.avatar} size={44} online={other?.isOnline} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-semibold truncate" style={{ color:"var(--fg)" }}>
                        {other?.name || "Unknown"}
                      </p>
                      <span className="text-xs shrink-0 ml-2" style={{ color:"var(--fg-subtle)" }}>
                        {formatTime(convo.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color:"var(--fg-muted)" }}>
                      {convo.lastMessage?.content || "Start a conversation"}
                    </p>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* ── Incoming call popup ── */}
      <IncomingCallAlert />

      {/* ── New chat modal ── */}
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }}
            onClick={e => { if (e.target===e.currentTarget) { setShowNew(false); setSearch(""); setUsers([]); } }}>

            <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }}
              exit={{ scale:0.9, opacity:0 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ background:"var(--bg-card)", border:"1px solid var(--border)", boxShadow:"var(--shadow-lg)" }}>

              <div className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor:"var(--border)" }}>
                <h3 className="font-bold text-base"
                  style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
                  New Conversation
                </h3>
                <button onClick={() => { setShowNew(false); setSearch(""); setUsers([]); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--bg-hover)]"
                  style={{ color:"var(--fg-muted)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color:"var(--fg-subtle)" }} />
                  <input autoFocus placeholder="Search by name or email..."
                    value={search} onChange={e => searchUsers(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                    style={{ background:"var(--bg)", border:"1px solid var(--border)", color:"var(--fg)" }} />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto pb-3">
                {searching && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 rounded-full border-2 border-t-transparent spin"
                      style={{ borderColor:"var(--primary)" }} />
                  </div>
                )}
                {!searching && users.length === 0 && search && (
                  <p className="text-center py-8 text-sm" style={{ color:"var(--fg-muted)" }}>
                    No users found for "{search}"
                  </p>
                )}
                {!searching && !search && (
                  <p className="text-center py-8 text-sm" style={{ color:"var(--fg-muted)" }}>
                    Type a name or email to search
                  </p>
                )}
                {users.map(u => (
                  <button key={u._id} onClick={() => startConvo(u._id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-hover)]">
                    <Avatar name={u.name} avatar={u.avatar} size={40} online={u.isOnline} />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color:"var(--fg)" }}>
                        {u.name}
                      </p>
                      <p className="text-xs truncate" style={{ color:"var(--fg-muted)" }}>
                        {u.email}
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background:"rgba(99,102,241,0.1)" }}>
                      <Plus className="w-3.5 h-3.5" style={{ color:"var(--primary)" }} />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}