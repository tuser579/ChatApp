// PATH: src/components/IncomingCallAlert.jsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, ShieldCheck, Lock } from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

// ── Ringtone via Web Audio API ────────────────────────────────────────────────
function startRinging() {
  let stopped = false;
  let ctx     = null;
  let timerId = null;

  function ring() {
    if (stopped) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      [[800, 0, 0.3], [640, 0.35, 0.3]].forEach(([freq, delay, dur]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0,    ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + delay + 0.05);
        gain.gain.setValueAtTime(0.4,  ctx.currentTime + delay + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0,   ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime  + delay + dur);
      });
    } catch (e) {}
    if (!stopped) timerId = setTimeout(ring, 3000);
  }

  ring();
  return function stop() {
    stopped = true;
    if (timerId) clearTimeout(timerId);
    if (ctx) { ctx.close().catch(() => {}); ctx = null; }
  };
}

const AUTO_DECLINE_MS = 60_000;

export default function IncomingCallAlert() {
  const router      = useRouter();
  const [incoming,  setIncoming]  = useState(null);
  const [countdown, setCountdown] = useState(0);

  const stopRingRef    = useRef(null);
  const handlerRef     = useRef(null);
  const autoDeclineRef = useRef(null);
  const countdownRef   = useRef(null);

  const stopRinging = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (autoDeclineRef.current) { clearTimeout(autoDeclineRef.current);  autoDeclineRef.current = null; }
    if (countdownRef.current)   { clearInterval(countdownRef.current);   countdownRef.current   = null; }
  }, []);

  const dismissCall = useCallback(() => {
    stopRinging();
    clearTimers();
    setIncoming(null);
    setCountdown(0);
  }, [stopRinging, clearTimers]);

  const startAutoDecline = useCallback((callData) => {
    setCountdown(AUTO_DECLINE_MS / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
    autoDeclineRef.current = setTimeout(() => {
      getSocket()?.emit("call:reject", { to: callData.from });
      dismissCall();
    }, AUTO_DECLINE_MS);
  }, [dismissCall]);

  useEffect(() => {
    const me   = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = me?.id || me?._id;
    if (!myId) return;

    handlerRef.current = ({ from, fromName, fromAvatar, offer, callType }) => {
      if (sessionStorage.getItem("activeCall")) {
        getSocket()?.emit("call:busy", { to: from });
        return;
      }

      const existing = sessionStorage.getItem("incomingCall");
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.from === from) return;
        } catch {}
      }

      stopRinging();
      clearTimers();
      stopRingRef.current = startRinging();

      const callData = { from, fromName, fromAvatar, offer, callType };
      setIncoming(callData);
      startAutoDecline(callData);
    };

    connectSocket(myId).then((socket) => {
      attachListeners(socket);
    });

    function attachListeners(socket) {
      socket.off("call:incoming",  handlerRef.current);
      socket.off("call:end");
      socket.off("call:rejected");
      socket.off("call:cancelled");
      socket.off("call:busy");
      socket.off("reconnect");
      socket.off("connect");

      socket.on("call:incoming",  handlerRef.current);
      socket.on("call:end",       () => dismissCall());
      socket.on("call:rejected",  () => dismissCall());
      socket.on("call:cancelled", () => dismissCall());
      socket.on("call:busy",      () => dismissCall());
      socket.on("reconnect",      () => { const s = getSocket(); if (s) attachListeners(s); });
      socket.on("connect",        () => { const s = getSocket(); if (s) attachListeners(s); });
    }

    return () => {
      stopRinging();
      clearTimers();
      const s = getSocket();
      if (s && handlerRef.current) s.off("call:incoming", handlerRef.current);
    };
  }, [stopRinging, clearTimers, dismissCall, startAutoDecline]);

  function accept() {
    if (!incoming) return;
    stopRinging();
    clearTimers();

    sessionStorage.setItem("incomingCall", JSON.stringify({
      from:       incoming.from,
      fromName:   incoming.fromName,
      fromAvatar: incoming.fromAvatar || "",
      offer:      incoming.offer,
      callType:   incoming.callType,
    }));

    sessionStorage.setItem("activeCall", "1");

    setIncoming(null);
    setCountdown(0);
    router.push(`/call?type=${incoming.callType}&from=${incoming.from}`);
  }

  function decline() {
    if (!incoming) return;
    getSocket()?.emit("call:reject", { to: incoming.from });
    dismissCall();
  }

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0,    scale: 1   }}
          exit={{   opacity: 0, y: -80, scale: 0.95  }}
          transition={{ type: "spring", damping: 22, stiffness: 320 }}
          className="fixed z-[9999] w-88 rounded-3xl p-4.5 border select-none shadow-2xl backdrop-blur-xl"
          style={{
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(23, 33, 43, 0.92)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.65)",
          }}
        >
          <div className="flex items-center gap-3.5">

            {/* Pulsing avatar / green aura */}
            <div className="relative shrink-0 w-13 h-13 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-emerald-500"
              />
              {incoming.fromAvatar ? (
                <img
                  src={incoming.fromAvatar}
                  alt={incoming.fromName}
                  className="w-full h-full rounded-full object-cover z-10 ring-2 ring-emerald-500/50"
                />
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center z-10 text-white font-bold text-lg shadow-lg"
                  style={{ background: "linear-gradient(135deg,#3390ec,#6366f1)" }}
                >
                  {incoming.fromName?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <Lock className="w-3 h-3" />
                <span>Incoming Telegram {incoming.callType === "video" ? "Video" : "Voice"} Call</span>
              </div>
              <p className="text-sm font-bold text-white truncate mt-0.5">
                {incoming.fromName || "Unknown Caller"}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {countdown > 0 ? `Auto-declining in ${countdown}s` : "Connecting..."}
              </p>
            </div>

            {/* Decline Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={decline}
              title="Decline"
              className="w-11 h-11 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white shadow-lg transition active:scale-95 shrink-0"
            >
              <PhoneOff className="w-5 h-5" />
            </motion.button>

            {/* Accept Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={accept}
              title="Accept"
              className="w-11 h-11 rounded-full flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)] transition active:scale-95 shrink-0"
            >
              {incoming.callType === "video" ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </motion.button>
          </div>

          {/* Progress Bar */}
          {countdown > 0 && (
            <div className="mt-3 h-1 rounded-full overflow-hidden bg-white/10">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: AUTO_DECLINE_MS / 1000, ease: "linear" }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}