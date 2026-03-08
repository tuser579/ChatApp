"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircle, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [form,    setForm]    = useState({ email: "", password: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [mounted, setMounted] = useState(false); // ✅ fix hydration

  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user",  JSON.stringify(data.user));
      router.push("/chat");
    } catch { setError("Something went wrong."); }
    finally   { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>

      {/* ✅ Only render theme button after mount to avoid hydration mismatch */}
      {mounted && (
        <button onClick={toggleTheme}
          className="fixed top-5 right-5 z-50 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all hover:scale-110"
          style={{ background:"var(--bg-card)", border:"1px solid var(--border)", boxShadow:"var(--shadow)" }}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      )}

      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-16 relative overflow-hidden"
        style={{ background: "var(--bg-2)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)",
          backgroundSize:  "40px 40px",
        }} />
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle,rgba(99,102,241,0.12) 0%,transparent 70%)" }} />

        <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold"
            style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
            NexChat
          </span>
        </motion.div>

        <motion.div initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.2 }} className="relative z-10">
          <h1 className="text-5xl font-extrabold mb-5 leading-tight"
            style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
            Connect.<br />
            <span style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              Chat.
            </span><br />Share.
          </h1>
          <p className="text-lg" style={{ color:"var(--fg-muted)", lineHeight:1.7 }}>
            Real-time messaging, video calls, and media sharing — all in one place.
          </p>
        </motion.div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
          className="flex flex-wrap gap-3 relative z-10">
          {["💬 Real-time chat","📹 Video calls","🎙️ Voice messages","📁 File sharing"].map(f => (
            <span key={f} className="px-4 py-2 rounded-full text-sm"
              style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.2)", color:"var(--primary-2)" }}>
              {f}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <motion.div initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.5 }} className="w-full max-w-md">

          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold"
              style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
              NexChat
            </span>
          </div>

          <h2 className="text-3xl font-bold mb-2"
            style={{ fontFamily:"'Syne',sans-serif", color:"var(--fg)" }}>
            Welcome back
          </h2>
          <p className="mb-8 text-sm" style={{ color:"var(--fg-muted)" }}>
            Sign in to continue your conversations
          </p>

          {error && (
            <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
              className="mb-5 px-4 py-3 rounded-xl text-sm"
              style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"var(--danger)" }}>
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color:"var(--fg-subtle)" }} />
              <input type="email" placeholder="Email address" required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm"
                style={{ background:"var(--bg)", border:"1px solid var(--border)", color:"var(--fg)" }} />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color:"var(--fg-subtle)" }} />
              <input type={showPw ? "text" : "password"} placeholder="Password" required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full pl-11 pr-11 py-3.5 rounded-xl text-sm"
                style={{ background:"var(--bg)", border:"1px solid var(--border)", color:"var(--fg)" }} />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color:"var(--fg-subtle)" }}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <motion.button type="submit" disabled={loading}
              whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)", boxShadow:"0 0 30px rgba(99,102,241,0.3)" }}>
              {loading
                ? <Loader2 className="w-4 h-4 spin" />
                : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
            </motion.button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color:"var(--fg-muted)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold"
              style={{ color:"var(--primary-2)" }}>
              Create one
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}