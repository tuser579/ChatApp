"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Forward, Search, Bookmark, Users, Check } from "lucide-react";

export default function ForwardModal({ message, conversations = [], me = {}, onForward, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getConvoName = (convo) => {
    if (convo.isSavedMessages) return "Saved Messages";
    if (convo.isGroup) return convo.groupName || "Group Chat";
    const myId = me?.id || me?._id;
    const other = convo.participants?.find((p) => p._id !== myId && String(p._id) !== String(myId));
    return other?.name || "Direct Chat";
  };

  const filtered = conversations.filter((c) =>
    getConvoName(c).toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = () => {
    if (selectedIds.length === 0) return;
    onForward(message._id, selectedIds);
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 10 }}
          className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border flex flex-col"
          style={{
            background: "var(--tg-card)",
            borderColor: "var(--tg-border)",
            boxShadow: "var(--tg-shadow-lg)",
            maxHeight: "85vh",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--tg-border)" }}
          >
            <div className="flex items-center gap-2">
              <Forward className="w-5 h-5 text-[var(--tg-accent)]" />
              <h3 className="font-semibold text-base text-[var(--tg-text)]">
                Forward Message
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--tg-border)" }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-text-muted)]" />
              <input
                type="text"
                placeholder="Search chats to forward to..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--tg-bg)",
                  border: "1px solid var(--tg-border)",
                  color: "var(--tg-text)",
                }}
              />
            </div>
          </div>

          {/* Message Preview Snippet */}
          <div
            className="mx-4 my-2 p-2.5 rounded-xl border-l-4 text-xs select-none"
            style={{
              background: "var(--tg-accent-light)",
              borderLeftColor: "var(--tg-accent)",
              color: "var(--tg-text)",
            }}
          >
            <span className="font-semibold block text-[11px] text-[var(--tg-accent)]">
              {message?.sender?.name || "Original Sender"}
            </span>
            <p className="truncate opacity-90">
              {message?.type === "image"
                ? "📷 Photo"
                : message?.type === "audio"
                ? "🎵 Voice message"
                : message?.type === "file"
                ? `📄 ${message?.fileName || "File"}`
                : message?.content || ""}
            </p>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-72">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-xs text-[var(--tg-text-muted)]">
                No chats found
              </p>
            ) : (
              filtered.map((convo) => {
                const name = getConvoName(convo);
                const isSelected = selectedIds.includes(convo._id);

                return (
                  <div
                    key={convo._id}
                    onClick={() => toggleSelect(convo._id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                      isSelected
                        ? "bg-[var(--tg-accent-light)]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                      style={{
                        background: convo.isSavedMessages
                          ? "linear-gradient(135deg,#3390ec,#60b1ff)"
                          : "linear-gradient(135deg,#6366f1,#06b6d4)",
                      }}
                    >
                      {convo.isSavedMessages ? (
                        <Bookmark className="w-5 h-5" />
                      ) : convo.isGroup ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        name[0]?.toUpperCase() || "?"
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--tg-text)] truncate">
                        {name}
                      </p>
                      <p className="text-xs text-[var(--tg-text-muted)] truncate">
                        {convo.isSavedMessages ? "Personal cloud notes" : convo.isGroup ? "Group" : "Chat"}
                      </p>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                        isSelected
                          ? "bg-[var(--tg-accent)] border-[var(--tg-accent)] text-white"
                          : "border-[var(--tg-border)]"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action */}
          <div
            className="p-4 border-t flex items-center justify-between"
            style={{ borderColor: "var(--tg-border)" }}
          >
            <span className="text-xs text-[var(--tg-text-muted)] font-medium">
              {selectedIds.length} {selectedIds.length === 1 ? "chat" : "chats"} selected
            </span>
            <button
              onClick={handleSend}
              disabled={selectedIds.length === 0}
              className={`px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-md ${
                selectedIds.length > 0
                  ? "bg-[var(--tg-accent)] text-white hover:bg-[var(--tg-accent-hover)]"
                  : "bg-gray-500/20 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Forward className="w-4 h-4" /> Send Forward
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
