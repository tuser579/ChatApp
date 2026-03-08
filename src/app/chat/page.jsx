// src/app/chat/page.jsx
"use client";
import { MessageCircle, ArrowRight } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6"
      style={{ background: "var(--bg)" }}>

      {/* Animated icon */}
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg,rgba(99,102,241,0.15),rgba(6,182,212,0.15))",
            border: "1px solid rgba(99,102,241,0.2)",
          }}>
          <MessageCircle className="w-10 h-10" style={{ color: "var(--primary)" }} />
        </div>

        {/* Ping rings */}
        <div className="absolute inset-0 rounded-3xl animate-ping opacity-20"
          style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }} />
      </div>

      {/* Text */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2"
          style={{ fontFamily: "'Syne',sans-serif", color: "var(--fg)" }}>
          Your conversations
        </h2>
        <p className="text-sm max-w-xs leading-relaxed"
          style={{ color: "var(--fg-muted)" }}>
          Select a chat from the sidebar to start messaging, or click
          <span className="font-semibold" style={{ color: "var(--primary)" }}> + </span>
          to start a new conversation.
        </p>
      </div>

      {/* Feature hints */}
      <div className="flex flex-col gap-2 mt-2">
        {[
          { emoji: "💬", label: "Real-time messaging" },
          { emoji: "📹", label: "Video & voice calls" },
          { emoji: "📎", label: "Share files & media" },
          { emoji: "🎙️", label: "Voice messages" },
        ].map(item => (
          <div key={item.label}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}>
            <span className="text-lg">{item.emoji}</span>
            <span className="text-sm" style={{ color: "var(--fg-muted)" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}