"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Search, Check, Camera } from "lucide-react";

export default function CreateGroupModal({ token, onGroupCreated, onClose }) {
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUsers("");
  }, []);

  async function fetchUsers(q) {
    setLoading(true);
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const toggleUser = (u) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x._id === u._id)
        ? prev.filter((x) => x._id !== u._id)
        : [...prev, u]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          isGroup: true,
          groupName: groupName.trim(),
          participants: selectedUsers.map((u) => u._id),
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        onGroupCreated(data.conversation);
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
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
              <Users className="w-5 h-5 text-[var(--tg-accent)]" />
              <h3 className="font-semibold text-base text-[var(--tg-text)]">
                New Group
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-[var(--tg-text-muted)] hover:text-[var(--tg-text)] hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Group Name input */}
          <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--tg-border)" }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--tg-accent-light)] flex items-center justify-center text-[var(--tg-accent)] shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <input
                type="text"
                autoFocus
                placeholder="Group Name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--tg-bg)",
                  border: "1px solid var(--tg-border)",
                  color: "var(--tg-text)",
                }}
              />
            </div>

            {/* Selected Chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-20 overflow-y-auto">
                {selectedUsers.map((u) => (
                  <span
                    key={u._id}
                    onClick={() => toggleUser(u)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--tg-accent-light)] text-[var(--tg-accent)] cursor-pointer hover:opacity-80 transition"
                  >
                    {u.name}
                    <X className="w-3 h-3" />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Search Users */}
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--tg-border)" }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-text-muted)]" />
              <input
                type="text"
                placeholder="Add members by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  fetchUsers(e.target.value);
                }}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--tg-bg)",
                  border: "1px solid var(--tg-border)",
                  color: "var(--tg-text)",
                }}
              />
            </div>
          </div>

          {/* Users List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-64">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 rounded-full border-2 border-t-transparent spin border-[var(--tg-accent)]" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-center py-6 text-xs text-[var(--tg-text-muted)]">
                No users found
              </p>
            ) : (
              users.map((u) => {
                const isSelected = selectedUsers.some((x) => x._id === u._id);
                return (
                  <div
                    key={u._id}
                    onClick={() => toggleUser(u)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                      isSelected
                        ? "bg-[var(--tg-accent-light)]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="relative">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                          style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
                        >
                          {u.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      {u.isOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--tg-success)] border-2 border-[var(--tg-card)]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--tg-text)] truncate">{u.name}</p>
                      <p className="text-xs text-[var(--tg-text-muted)] truncate">{u.email}</p>
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
              {selectedUsers.length} members selected
            </span>
            <button
              onClick={handleCreate}
              disabled={creating || !groupName.trim() || selectedUsers.length === 0}
              className={`px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-md ${
                groupName.trim() && selectedUsers.length > 0 && !creating
                  ? "bg-[var(--tg-accent)] text-white hover:bg-[var(--tg-accent-hover)]"
                  : "bg-gray-500/20 text-gray-400 cursor-not-allowed"
              }`}
            >
              {creating ? "Creating..." : "Create Group"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
