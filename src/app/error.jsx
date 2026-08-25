"use client";
import { useEffect } from "react";
import { RefreshCw, AlertTriangle, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0e1621] text-white">
      <div className="w-full max-w-md p-8 rounded-3xl bg-[#17212b] border border-white/10 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            An unexpected error occurred. You can retry or return to your chats.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--tg-accent)] hover:bg-[var(--tg-accent-hover)] text-white text-sm font-semibold transition shadow-md"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <Link
            href="/chat"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition"
          >
            <Home className="w-4 h-4" /> Go to Chats
          </Link>
        </div>
      </div>
    </div>
  );
}
