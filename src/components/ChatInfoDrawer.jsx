"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Phone, Video, Bell, Image as ImageIcon, FileText, Music,
  Users, Bookmark, Download, ExternalLink, ShieldCheck, Mail
} from "lucide-react";

export default function ChatInfoDrawer({
  isOpen,
  onClose,
  conversation,
  otherUser,
  messages = [],
  me = {},
  onStartCall,
  onOpenMedia
}) {
  const [activeTab, setActiveTab] = useState("media"); // 'media' | 'files' | 'audio' | 'members'

  if (!isOpen) return null;

  const isSavedMessages = conversation?.isSavedMessages;
  const isGroup = conversation?.isGroup;
  const title = isSavedMessages
    ? "Saved Messages"
    : isGroup
    ? conversation?.groupName || "Group"
    : otherUser?.name || "User Info";

  const subtitle = isSavedMessages
    ? "Your cloud storage"
    : isGroup
    ? `${conversation?.participants?.length || 0} members`
    : otherUser?.isOnline
    ? "online"
    : otherUser?.lastSeen
    ? `last seen ${new Date(otherUser.lastSeen).toLocaleDateString()}`
    : "offline";

  // Filter shared media
  const sharedMedia = messages.filter((m) => m.type === "image" && !m.isDeleted && m.mediaUrl);
  const sharedFiles = messages.filter((m) => m.type === "file" && !m.isDeleted && m.mediaUrl);
  const sharedAudio = messages.filter((m) => m.type === "audio" && !m.isDeleted && m.mediaUrl);

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: 360, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 360, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 280 }}
        className="w-80 lg:w-96 h-full flex flex-col border-l z-20 shrink-0"
        style={{
          background: "var(--tg-sidebar)",
          borderColor: "var(--tg-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--tg-border)" }}
        >
          <h3 className="font-bold text-base text-[var(--tg-text)]">
            {isGroup ? "Group Info" : "User Info"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User / Group Profile Card */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center p-6 border-b text-center" style={{ borderColor: "var(--tg-border)" }}>
            <div className="relative mb-3">
              {isSavedMessages ? (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg"
                  style={{ background: "linear-gradient(135deg,#3390ec,#60b1ff)" }}
                >
                  <Bookmark className="w-10 h-10" />
                </div>
              ) : isGroup ? (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg"
                  style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                >
                  <Users className="w-10 h-10" />
                </div>
              ) : otherUser?.avatar ? (
                <img
                  src={otherUser.avatar}
                  alt={title}
                  className="w-20 h-20 rounded-full object-cover shadow-lg"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-white text-2xl shadow-lg"
                  style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                >
                  {title?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            <h4 className="font-bold text-lg text-[var(--tg-text)]">{title}</h4>
            <p
              className="text-xs mt-0.5"
              style={{
                color: otherUser?.isOnline ? "var(--tg-accent)" : "var(--tg-text-muted)",
              }}
            >
              {subtitle}
            </p>

            {/* Quick Actions (Audio / Video Call) */}
            {!isSavedMessages && !isGroup && (
              <div className="flex items-center gap-4 mt-5">
                <button
                  onClick={() => onStartCall("audio")}
                  className="flex flex-col items-center gap-1 text-[var(--tg-text-muted)] hover:text-[var(--tg-accent)] transition group"
                >
                  <div className="w-11 h-11 rounded-full bg-[var(--tg-accent-light)] flex items-center justify-center text-[var(--tg-accent)] group-hover:scale-105 transition-transform">
                    <Phone className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-medium">Audio</span>
                </button>

                <button
                  onClick={() => onStartCall("video")}
                  className="flex flex-col items-center gap-1 text-[var(--tg-text-muted)] hover:text-[var(--tg-accent)] transition group"
                >
                  <div className="w-11 h-11 rounded-full bg-[var(--tg-accent-light)] flex items-center justify-center text-[var(--tg-accent)] group-hover:scale-105 transition-transform">
                    <Video className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-medium">Video</span>
                </button>
              </div>
            )}
          </div>

          {/* Email / Status Info */}
          {!isSavedMessages && !isGroup && otherUser?.email && (
            <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--tg-border)" }}>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-[var(--tg-text-muted)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-[var(--tg-text-muted)]">Email</p>
                  <p className="text-sm font-medium text-[var(--tg-text)] truncate">{otherUser.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Media / Files / Audio / Members Tabs */}
          <div className="border-b" style={{ borderColor: "var(--tg-border)" }}>
            <div className="flex items-center justify-around text-xs font-semibold px-2">
              <button
                onClick={() => setActiveTab("media")}
                className={`py-3 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === "media"
                    ? "border-[var(--tg-accent)] text-[var(--tg-accent)]"
                    : "border-transparent text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Media ({sharedMedia.length})
              </button>

              <button
                onClick={() => setActiveTab("files")}
                className={`py-3 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === "files"
                    ? "border-[var(--tg-accent)] text-[var(--tg-accent)]"
                    : "border-transparent text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Files ({sharedFiles.length})
              </button>

              <button
                onClick={() => setActiveTab("audio")}
                className={`py-3 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === "audio"
                    ? "border-[var(--tg-accent)] text-[var(--tg-accent)]"
                    : "border-transparent text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                }`}
              >
                <Music className="w-3.5 h-3.5" /> Voice ({sharedAudio.length})
              </button>

              {isGroup && (
                <button
                  onClick={() => setActiveTab("members")}
                  className={`py-3 px-2 border-b-2 transition flex items-center gap-1.5 ${
                    activeTab === "members"
                      ? "border-[var(--tg-accent)] text-[var(--tg-accent)]"
                      : "border-transparent text-[var(--tg-text-muted)] hover:text-[var(--tg-text)]"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> ({conversation?.participants?.length || 0})
                </button>
              )}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {/* Media Tab */}
            {activeTab === "media" && (
              <div>
                {sharedMedia.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[var(--tg-text-muted)]">
                    No shared photos or videos
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {sharedMedia.map((m) => (
                      <div
                        key={m._id}
                        onClick={() => onOpenMedia?.(m.mediaUrl)}
                        className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition group relative"
                      >
                        <img
                          src={m.mediaUrl}
                          alt="Shared media"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Files Tab */}
            {activeTab === "files" && (
              <div className="space-y-2">
                {sharedFiles.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[var(--tg-text-muted)]">
                    No shared documents
                  </p>
                ) : (
                  sharedFiles.map((m) => (
                    <a
                      key={m._id}
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition border border-transparent hover:border-[var(--tg-border)]"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[var(--tg-accent-light)] flex items-center justify-center text-[var(--tg-accent)] shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--tg-text)] truncate">
                          {m.fileName || "Document"}
                        </p>
                        <p className="text-[10px] text-[var(--tg-text-muted)]">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-[var(--tg-text-muted)]" />
                    </a>
                  ))
                )}
              </div>
            )}

            {/* Voice / Audio Tab */}
            {activeTab === "audio" && (
              <div className="space-y-2">
                {sharedAudio.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[var(--tg-text-muted)]">
                    No voice messages
                  </p>
                ) : (
                  sharedAudio.map((m) => (
                    <div
                      key={m._id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition"
                    >
                      <div className="w-9 h-9 rounded-full bg-[var(--tg-accent-light)] flex items-center justify-center text-[var(--tg-accent)] shrink-0">
                        <Music className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--tg-text)]">Voice Message</p>
                        <p className="text-[10px] text-[var(--tg-text-muted)]">
                          {new Date(m.createdAt).toLocaleDateString()} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Group Members Tab */}
            {activeTab === "members" && isGroup && (
              <div className="space-y-2">
                {conversation?.participants?.map((p) => {
                  const isAdmin = conversation?.groupAdmin === p._id || conversation?.groupAdmin?._id === p._id;
                  return (
                    <div
                      key={p._id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                    >
                      <div className="relative">
                        {p.avatar ? (
                          <img src={p.avatar} alt={p.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs"
                            style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                          >
                            {p.name?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        {p.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--tg-success)] border-2 border-[var(--tg-sidebar)]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--tg-text)] truncate">{p.name}</p>
                        <p className="text-[10px] text-[var(--tg-text-muted)] truncate">
                          {p.isOnline ? "online" : "offline"}
                        </p>
                      </div>

                      {isAdmin && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--tg-accent-light)] text-[var(--tg-accent)]">
                          admin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
