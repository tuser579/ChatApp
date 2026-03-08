"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, Check, Loader2, Sun, Moon, Bell, Lock, Trash2, LogOut, ChevronRight, Edit3 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

function Toggle({ on, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-11 h-6 rounded-full transition-all duration-300 relative"
      style={{ background: on ? "var(--primary)" : "var(--bg-hover)", border:"1px solid var(--border)" }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300"
        style={{ left: on ? "calc(100% - 22px)" : "2px" }} />
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const fileRef = useRef(null);

  const [user,      setUser]      = useState(null);
  const [editing,   setEditing]   = useState(false);
  const [name,      setName]      = useState("");
  const [status,    setStatus]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifs,    setNotifs]    = useState(true);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    setUser(u); setName(u.name || ""); setStatus(u.status || "Hey there!");
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ name, status }),
      });
      if (res.ok) {
        const updated = { ...user, name, status };
        localStorage.setItem("user", JSON.stringify(updated));
        setUser(updated); setEditing(false);
        setSaved(true); setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    finally { setSaving(false); }
  }

  async function uploadAvatar(file) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/media", { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:form });
      const data = await res.json();
      await fetch("/api/users/me", {
        method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ avatar: data.url }),
      });
      const updated = { ...user, avatar: data.url };
      localStorage.setItem("user", JSON.stringify(updated));
      setUser(updated);
    } catch {}
    finally { setUploading(false); }
  }

  function logout() { localStorage.clear(); router.push("/login"); }

  if (!user) return (
    <div className="flex items-center justify-center h-screen" style={{ background:"var(--bg)" }}>
      <Loader2 className="w-6 h-6 spin" style={{ color:"var(--primary)" }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background:"var(--bg)" }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4 sticky top-0 z-10"
          style={{ background:"var(--bg)", borderBottom:"1px solid var(--border)" }}>
          <button onClick={() => router.push("/chat")} style={{ color:"var(--fg-muted)" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1" style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
            Profile & Settings
          </h1>
          {saved && (
            <motion.span initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded-full"
              style={{ background:"rgba(34,197,94,0.1)", color:"var(--success)" }}>
              <Check className="w-3 h-3" /> Saved
            </motion.span>
          )}
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center py-8 px-4">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-3xl"
              style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
              {user.avatar
                ? <img src={user.avatar} className="w-full h-full object-cover" />
                : user.name?.[0]?.toUpperCase()}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)", border:"2px solid var(--bg)" }}>
              {uploading ? <Loader2 className="w-4 h-4 text-white spin" /> : <Camera className="w-4 h-4 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files[0] && uploadAvatar(e.target.files[0])} />
          </div>

          {editing ? (
            <div className="w-full space-y-3 max-w-xs">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" className="w-full px-4 py-3 rounded-xl text-sm text-center font-bold" />
              <input value={status} onChange={e => setStatus(e.target.value)}
                placeholder="Status message" className="w-full px-4 py-2.5 rounded-xl text-sm text-center" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm"
                  style={{ background:"var(--bg-hover)", color:"var(--fg-muted)" }}>
                  Cancel
                </button>
                <button onClick={saveProfile} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
                  {saving ? <Loader2 className="w-4 h-4 spin" /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <h2 className="text-xl font-bold" style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
                  {user.name}
                </h2>
                <button onClick={() => setEditing(true)} style={{ color:"var(--fg-muted)" }}>
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm mb-1" style={{ color:"var(--fg-muted)" }}>{user.email}</p>
              <p className="text-sm" style={{ color:"var(--fg-subtle)" }}>{status}</p>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="px-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
            style={{ color:"var(--fg-subtle)", fontFamily:"'JetBrains Mono',monospace" }}>
            Preferences
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
            {[
              { icon: theme==="dark" ? Sun : Moon, label:"Theme",         sub: theme==="dark" ? "Dark mode" : "Light mode", right:<Toggle on={theme==="dark"} onToggle={toggleTheme} /> },
              { icon: Bell,                         label:"Notifications", sub:"Message alerts",                              right:<Toggle on={notifs} onToggle={() => setNotifs(n=>!n)} /> },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i>0 ? "1px solid var(--border)" : "none" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"var(--bg-hover)" }}>
                  <item.icon className="w-4 h-4" style={{ color:"var(--primary)" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color:"var(--fg)" }}>{item.label}</p>
                  <p className="text-xs" style={{ color:"var(--fg-subtle)" }}>{item.sub}</p>
                </div>
                {item.right}
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
            style={{ color:"var(--fg-subtle)", fontFamily:"'JetBrains Mono',monospace" }}>
            Account
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
            {[
              { icon:Lock,  label:"Privacy",         sub:"Who can contact you" },
              { icon:Trash2, label:"Clear All Chats", sub:"Delete message history", danger:true },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[var(--bg-hover)] transition"
                style={{ borderTop: i>0 ? "1px solid var(--border)" : "none" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: item.danger ? "rgba(239,68,68,0.1)" : "var(--bg-hover)" }}>
                  <item.icon className="w-4 h-4" style={{ color: item.danger ? "var(--danger)" : "var(--primary)" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: item.danger ? "var(--danger)" : "var(--fg)" }}>{item.label}</p>
                  <p className="text-xs" style={{ color:"var(--fg-subtle)" }}>{item.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color:"var(--fg-muted)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <div className="px-4 pb-10">
          <button onClick={logout}
            className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold hover:opacity-80 transition"
            style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"var(--danger)" }}>
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}