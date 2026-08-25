// src/app/chat/page.jsx
"use client";
import { Send, Shield, Zap, Cloud, Sparkles } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-6 p-6 select-none tg-chat-wallpaper"
      style={{ background: "var(--tg-bg)" }}
    >
      {/* Telegram Badge */}
      <div className="relative">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl"
          style={{
            background: "linear-gradient(135deg,#3390ec,#2481cc)",
          }}
        >
          <Send className="w-11 h-11 text-white ml-0.5" />
        </div>

        <div
          className="absolute -inset-2 rounded-full animate-ping opacity-15"
          style={{ background: "var(--tg-accent)" }}
        />
      </div>

      {/* Title */}
      <div className="text-center max-w-sm">
        <span
          className="px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md inline-block mb-3"
          style={{
            background: "var(--tg-date-badge)",
            color: "var(--tg-date-fg)",
          }}
        >
          Select a chat to start messaging
        </span>
        <h2 className="text-xl font-bold mb-1.5 text-[var(--tg-text)]">
          Telegram Web
        </h2>
        <p className="text-xs leading-relaxed text-[var(--tg-text-muted)]">
          Fast, secure, and synchronized across all your devices. Enjoy voice notes, stickers, channels, and instant calls.
        </p>
      </div>

      {/* Feature Pills */}
      <div className="grid grid-cols-2 gap-2.5 max-w-sm w-full">
        {[
          { icon: <Zap className="w-4 h-4 text-amber-400" />, label: "Instant Messaging" },
          { icon: <Cloud className="w-4 h-4 text-sky-400" />, label: "Saved Cloud Notes" },
          { icon: <Sparkles className="w-4 h-4 text-purple-400" />, label: "Voice & Stickers" },
          { icon: <Shield className="w-4 h-4 text-emerald-400" />, label: "Encrypted Calls" },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition"
            style={{
              background: "var(--tg-card)",
              borderColor: "var(--tg-border)",
              boxShadow: "var(--tg-shadow)",
            }}
          >
            {item.icon}
            <span className="text-xs font-medium text-[var(--tg-text)]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}