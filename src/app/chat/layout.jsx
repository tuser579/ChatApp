"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sun, Moon, Plus, X, LogOut, User, Settings,
  Menu, Bookmark, Users, MessageSquare, Check, CheckCheck,
  Edit3, Shield, Folder
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { connectSocket, getSocket } from "@/lib/socket";
import CreateGroupModal from "@/components/CreateGroupModal";

function Avatar({ name, avatar, size = 48, online, isSavedMessages, isGroup }) {
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
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
          style={{
            background: online ? "var(--tg-success)" : "var(--tg-text-subtle)",
            borderColor: "var(--tg-sidebar)",
          }}
        />
      )}
    </div>
  );
}

export default function ChatLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [mounted,       setMounted]       = useState(false);
  const [token,         setToken]         = useState("");
  const [me,            setMe]            = useState({});
  const [convos,        setConvos]        = useState([]);
  const [search,        setSearch]        = useState("");
  const [users,         setUsers]         = useState([]);
  const [showNew,       setShowNew]       = useState(false);
  const [showGroupModal,setShowGroupModal]= useState(false);
  const [showDrawerMenu,setShowDrawerMenu]= useState(false);
  const [searching,     setSearching]     = useState(false);
  const [convoSearch,   setConvoSearch]   = useState("");
  const [activeFolder,  setActiveFolder]  = useState("all"); // 'all' | 'direct' | 'groups' | 'unread'

  useEffect(() => {
    const t = localStorage.getItem("token") || "";
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!t) { router.push("/login"); return; }
    setToken(t);
    setMe(u);
    setMounted(true);
    fetchConvos(t);
  }, []);

  useEffect(() => {
    if (!mounted || !token) return;
    const myId = me?.id || me?._id;
    if (myId) {
      connectSocket(myId).then((socket) => {
        socket.off("conversation:update");
        socket.on("conversation:update", () => {
          fetchConvos(token);
        });
        socket.off("user:online");
        socket.on("user:online", ({ userId, isOnline }) => {
          setConvos((prev) =>
            prev.map((c) => {
              const updatedParticipants = c.participants?.map((p) =>
                p._id === userId ? { ...p, isOnline } : p
              );
              return { ...c, participants: updatedParticipants };
            })
          );
        });
      });
    }
  }, [mounted, token, me]);

  useEffect(() => {
    if (!mounted || !token) return;
    fetchConvos(token);
  }, [pathname]);

  async function fetchConvos(t) {
    try {
      const res  = await fetch("/api/conversations", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      setConvos(data.conversations || []);
    } catch {}
  }

  async function openSavedMessages() {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isSavedMessages: true }),
      });
      const data = await res.json();
      setShowDrawerMenu(false);
      await fetchConvos(token);
      if (data.conversation?._id) {
        router.push(`/chat/${data.conversation._id}`);
      }
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

  // Filter conversations based on folder tabs & search
  const filteredConvos = convos.filter((convo) => {
    const other = getOther(convo);
    const title = convo.isSavedMessages
      ? "Saved Messages"
      : convo.isGroup
      ? convo.groupName || "Group"
      : other?.name || "Chat";

    if (convoSearch && !title.toLowerCase().includes(convoSearch.toLowerCase())) {
      return false;
    }

    if (activeFolder === "direct") return !convo.isGroup && !convo.isSavedMessages;
    if (activeFolder === "groups") return convo.isGroup;
    if (activeFolder === "unread") {
      const myId = me?.id || me?._id;
      return convo.lastMessage && !convo.lastMessage?.seen?.includes(myId) && convo.lastMessage?.sender !== myId;
    }
    return true;
  });

  const activeId = pathname.split("/chat/")[1];

  if (!mounted) return (
    <div className="flex h-screen items-center justify-center" style={{ background:"var(--tg-bg)" }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent spin"
        style={{ borderColor:"var(--tg-accent)" }} />
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:"var(--tg-bg)" }}>

      {/* ── Telegram Left Sidebar ── */}
      <aside className={`flex flex-col shrink-0 border-r transition-all
        ${activeId ? "hidden lg:flex" : "flex"}
        w-full lg:w-80 xl:w-96 relative`}
        style={{ background:"var(--tg-sidebar)", borderColor:"var(--tg-border)" }}>

        {/* Telegram Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b"
          style={{ borderColor:"var(--tg-border)" }}>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDrawerMenu(true)}
              className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-lg tracking-tight text-[var(--tg-text)]">
              Telegram
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={toggleTheme}
              className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="Toggle Theme">
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowNew(true)}
              className="p-2 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
              title="New Chat">
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telegram Search Bar */}
        <div className="px-3.5 py-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-text-muted)]" />
            <input
              placeholder="Search"
              value={convoSearch}
              onChange={(e) => setConvoSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2 rounded-xl text-sm transition"
              style={{
                background: "var(--tg-card)",
                border: "1px solid var(--tg-border)",
                color: "var(--tg-text)",
              }}
            />
            {convoSearch && (
              <button
                onClick={() => setConvoSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Telegram Folders / Tabs */}
        <div className="flex items-center px-2 border-b overflow-x-auto select-none" style={{ borderColor: "var(--tg-border)" }}>
          {[
            { id: "all", label: "All Chats" },
            { id: "direct", label: "Direct" },
            { id: "groups", label: "Groups" },
            { id: "unread", label: "Unread" },
          ].map((folder) => {
            const isActive = activeFolder === folder.id;
            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={`relative px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? "text-[var(--tg-accent)]"
                    : "text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                }`}
              >
                {folder.label}
                {isActive && (
                  <motion.div
                    layoutId="folder-indicator"
                    className="absolute bottom-0 inset-x-2 h-0.5 bg-[var(--tg-accent)] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[var(--tg-accent-light)] text-[var(--tg-accent)]">
                <MessageSquare className="w-7 h-7" />
              </div>
              <p className="text-sm font-medium text-[var(--tg-text-muted)]">
                {convoSearch ? `No chats match "${convoSearch}"` : "No chats yet.\nClick + to start chatting!"}
              </p>
            </div>
          ) : (
            filteredConvos.map((convo) => {
              const other = getOther(convo);
              const isActive = convo._id === activeId;
              const isSaved = convo.isSavedMessages;
              const isGroup = convo.isGroup;
              const title = isSaved
                ? "Saved Messages"
                : isGroup
                ? convo.groupName || "Group Chat"
                : other?.name || "Chat";

              const myId = me?.id || me?._id;
              const isLastMe = convo.lastMessage?.sender === myId || convo.lastMessage?.sender?._id === myId;
              const isUnread = convo.lastMessage && !convo.lastMessage?.seen?.includes(myId) && !isLastMe;

              return (
                <Link key={convo._id} href={`/chat/${convo._id}`}>
                  <div
                    className={`flex items-center gap-3 px-3.5 py-3 cursor-pointer transition-colors select-none ${
                      isActive
                        ? "bg-[var(--tg-sidebar-active)] text-white"
                        : "hover:bg-[var(--tg-sidebar-hover)]"
                    }`}
                  >
                    <Avatar
                      name={title}
                      avatar={isSaved ? null : isGroup ? convo.groupAvatar : other?.avatar}
                      size={46}
                      online={isSaved || isGroup ? undefined : other?.isOnline}
                      isSavedMessages={isSaved}
                      isGroup={isGroup}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isActive ? "text-white" : "text-[var(--tg-text)]"
                          }`}
                        >
                          {title}
                        </p>
                        <span
                          className={`text-xs shrink-0 ml-2 ${
                            isActive ? "text-white/80" : "text-[var(--tg-text-muted)]"
                          }`}
                        >
                          {formatTime(convo.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs truncate flex-1 flex items-center gap-1 ${
                            isActive ? "text-white/85" : "text-[var(--tg-text-muted)]"
                          }`}
                        >
                          {isLastMe && !convo.lastMessage?.isDeleted && (
                            <span className="shrink-0 flex items-center">
                              {convo.lastMessage?.seen?.length > 1 ? (
                                <CheckCheck className="w-3.5 h-3.5 text-[var(--tg-tick-seen)] inline" />
                              ) : (
                                <Check className="w-3.5 h-3.5 opacity-70 inline" />
                              )}
                              <span className="ml-1 opacity-80">You: </span>
                            </span>
                          )}
                          {convo.lastMessage?.isDeleted
                            ? "🚫 Message deleted"
                            : convo.lastMessage?.type === "image"
                            ? "📷 Photo"
                            : convo.lastMessage?.type === "audio"
                            ? "🎵 Voice message"
                            : convo.lastMessage?.type === "file"
                            ? `📄 ${convo.lastMessage?.fileName || "File"}`
                            : convo.lastMessage?.content || (isSaved ? "Saved items cloud" : "Start chatting")}
                        </p>

                        {isUnread && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--tg-badge-bg)] text-[var(--tg-badge-fg)]">
                            1
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Telegram Floating Action Button (New Chat / Group) */}
        <div className="absolute bottom-5 right-5 z-20">
          <button
            onClick={() => setShowNew(true)}
            className="w-13 h-13 rounded-full bg-[var(--tg-accent)] text-white shadow-xl hover:bg-[var(--tg-accent-hover)] transition flex items-center justify-center group active:scale-95"
            title="New Chat"
          >
            <Edit3 className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </aside>

      {/* ── Telegram Main Chat Pane ── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* ── Telegram Slide-out Drawer Menu (Hamburger) ── */}
      <AnimatePresence>
        {showDrawerMenu && (
          <div
            className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDrawerMenu(false)}
          >
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="w-72 sm:w-80 h-full flex flex-col shadow-2xl"
              style={{ background: "var(--tg-sidebar)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Profile Card Header */}
              <div
                className="p-5 border-b"
                style={{
                  background: "linear-gradient(135deg,#2b5278,#17212b)",
                  borderColor: "var(--tg-border)",
                }}
              >
                <Avatar name={me?.name} avatar={me?.avatar} size={54} />
                <h3 className="font-bold text-base text-white mt-3 truncate">{me?.name || "My Account"}</h3>
                <p className="text-xs text-white/70 truncate">{me?.email}</p>
              </div>

              {/* Menu items */}
              <div className="flex-1 overflow-y-auto py-2 space-y-1">
                <button
                  onClick={openSavedMessages}
                  className="w-full flex items-center gap-4 px-5 py-3 text-sm text-[var(--tg-text)] hover:bg-white/5 transition"
                >
                  <Bookmark className="w-5 h-5 text-[var(--tg-accent)]" />
                  <span className="font-medium">Saved Messages</span>
                </button>

                <button
                  onClick={() => {
                    setShowDrawerMenu(false);
                    setShowGroupModal(true);
                  }}
                  className="w-full flex items-center gap-4 px-5 py-3 text-sm text-[var(--tg-text)] hover:bg-white/5 transition"
                >
                  <Users className="w-5 h-5 text-[var(--tg-accent)]" />
                  <span className="font-medium">New Group</span>
                </button>

                <Link
                  href="/profile"
                  onClick={() => setShowDrawerMenu(false)}
                  className="w-full flex items-center gap-4 px-5 py-3 text-sm text-[var(--tg-text)] hover:bg-white/5 transition"
                >
                  <User className="w-5 h-5 text-[var(--tg-accent)]" />
                  <span className="font-medium">My Profile</span>
                </Link>

                <Link
                  href="/profile"
                  onClick={() => setShowDrawerMenu(false)}
                  className="w-full flex items-center gap-4 px-5 py-3 text-sm text-[var(--tg-text)] hover:bg-white/5 transition"
                >
                  <Settings className="w-5 h-5 text-[var(--tg-accent)]" />
                  <span className="font-medium">Settings</span>
                </Link>

                {/* Night Mode Toggle */}
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm text-[var(--tg-text)] hover:bg-white/5 transition"
                >
                  <div className="flex items-center gap-4">
                    {theme === "dark" ? <Moon className="w-5 h-5 text-[var(--tg-accent)]" /> : <Sun className="w-5 h-5 text-[var(--tg-accent)]" />}
                    <span className="font-medium">Night Mode</span>
                  </div>
                  <div
                    className={`w-10 h-5 rounded-full transition flex items-center px-0.5 ${
                      theme === "dark" ? "bg-[var(--tg-accent)] justify-end" : "bg-gray-400 justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                  </div>
                </button>

                <div className="my-2 border-t" style={{ borderColor: "var(--tg-border)" }} />

                <button
                  onClick={logout}
                  className="w-full flex items-center gap-4 px-5 py-3 text-sm text-[var(--tg-danger)] hover:bg-white/5 transition"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Log Out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Telegram New Chat Modal ── */}
      <AnimatePresence>
        {showNew && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowNew(false); setSearch(""); setUsers([]); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border flex flex-col"
              style={{
                background: "var(--tg-card)",
                borderColor: "var(--tg-border)",
                boxShadow: "var(--tg-shadow-lg)",
                maxHeight: "85vh",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: "var(--tg-border)" }}
              >
                <h3 className="font-bold text-base text-[var(--tg-text)]">
                  New Message
                </h3>
                <button
                  onClick={() => { setShowNew(false); setSearch(""); setUsers([]); }}
                  className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action buttons inside new chat modal: New Group & Saved Messages */}
              <div className="p-2 border-b space-y-1" style={{ borderColor: "var(--tg-border)" }}>
                <button
                  onClick={() => {
                    setShowNew(false);
                    setShowGroupModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 transition text-left text-sm font-semibold text-[var(--tg-accent)]"
                >
                  <Users className="w-5 h-5" /> New Group
                </button>
                <button
                  onClick={() => {
                    setShowNew(false);
                    openSavedMessages();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 transition text-left text-sm font-semibold text-[var(--tg-accent)]"
                >
                  <Bookmark className="w-5 h-5" /> Saved Messages
                </button>
              </div>

              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-text-muted)]" />
                  <input
                    autoFocus
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => searchUsers(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: "var(--tg-bg)",
                      border: "1px solid var(--tg-border)",
                      color: "var(--tg-text)",
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-64">
                {searching && (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 rounded-full border-2 border-t-transparent spin border-[var(--tg-accent)]" />
                  </div>
                )}
                {!searching && users.length === 0 && search && (
                  <p className="text-center py-6 text-xs text-[var(--tg-text-muted)]">
                    No users found for "{search}"
                  </p>
                )}
                {!searching && !search && (
                  <p className="text-center py-6 text-xs text-[var(--tg-text-muted)]">
                    Type a name to search contacts
                  </p>
                )}
                {users.map((u) => (
                  <button
                    key={u._id}
                    onClick={() => startConvo(u._id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition text-left"
                  >
                    <Avatar name={u.name} avatar={u.avatar} size={42} online={u.isOnline} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--tg-text)] truncate">{u.name}</p>
                      <p className="text-xs text-[var(--tg-text-muted)] truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Telegram Create Group Modal ── */}
      {showGroupModal && (
        <CreateGroupModal
          token={token}
          onGroupCreated={(newConvo) => {
            fetchConvos(token);
            if (newConvo?._id) router.push(`/chat/${newConvo._id}`);
          }}
          onClose={() => setShowGroupModal(false)}
        />
      )}
    </div>
  );
}