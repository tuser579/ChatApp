// PATH: src/components/IncomingCallAlert.jsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
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
    } catch (e) { console.warn("Ringtone error:", e); }
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
      console.log("⏰ Auto-declining call");
      getSocket()?.emit("call:reject", { to: callData.from });
      dismissCall();
    }, AUTO_DECLINE_MS);
  }, [dismissCall]);

  useEffect(() => {
    const me   = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = me?.id || me?._id;
    if (!myId) return;

    handlerRef.current = ({ from, fromName, fromAvatar, offer, callType }) => {
      console.log("📞 INCOMING CALL:", { from, fromName, callType });

      // ✅ FIX 1: If we are already in an active call — send busy and ignore
      if (sessionStorage.getItem("activeCall")) {
        console.log("📵 Already in a call — sending busy");
        getSocket()?.emit("call:busy", { to: from });
        return;
      }

      // ✅ FIX 2: If this call was already accepted (same from + offer exists
      // in sessionStorage) — this is a re-delivery, silently ignore it
      const existing = sessionStorage.getItem("incomingCall");
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.from === from) {
            console.log("🔁 Duplicate call:incoming ignored — already accepted");
            return;
          }
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
      console.log("🔔 IncomingCallAlert socket ready:", socket.id);
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
      socket.on("call:end",       () => { console.log("📵 Remote ended");   dismissCall(); });
      socket.on("call:rejected",  () => { console.log("🚫 Rejected");       dismissCall(); });
      socket.on("call:cancelled", () => { console.log("❌ Cancelled");      dismissCall(); });
      socket.on("call:busy",      () => { console.log("📵 Busy");           dismissCall(); });
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

    // ✅ FIX 3: Mark active BEFORE navigating so re-delivery is blocked
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
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0,    scale: 1   }}
          exit={{   opacity: 0, y: -100, scale: 0.9  }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed z-[9999] w-80 rounded-2xl p-4"
          style={{
            top:       "16px",
            left:      "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-card)",
            border:     "1px solid var(--border)",
            boxShadow:  "0 8px 40px rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex items-center gap-3">

            {/* Pulsing avatar / icon */}
            <div className="relative shrink-0 w-12 h-12">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--success)" }}
              />
              {incoming.fromAvatar ? (
                <img
                  src={incoming.fromAvatar}
                  alt={incoming.fromName}
                  className="absolute inset-0 w-full h-full rounded-full object-cover z-10"
                />
              ) : (
                <div className="absolute inset-0 rounded-full flex items-center justify-center z-10"
                  style={{ background: "rgba(34,197,94,0.15)" }}>
                  {incoming.callType === "video"
                    ? <Video className="w-5 h-5" style={{ color: "var(--success)" }} />
                    : <Phone className="w-5 h-5" style={{ color: "var(--success)" }} />}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs mb-0.5" style={{ color: "var(--fg-muted)" }}>
                Incoming {incoming.callType === "video" ? "Video" : "Voice"} Call
              </p>
              <p className="text-sm font-bold truncate" style={{ color: "var(--fg)" }}>
                {incoming.fromName || incoming.from}
              </p>
              {countdown > 0 && (
                <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  Auto-decline in {countdown}s
                </p>
              )}
            </div>

            {/* Decline */}
            <motion.button whileTap={{ scale: 0.9 }} onClick={decline} title="Decline"
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(239,68,68,0.15)" }}>
              <PhoneOff className="w-4 h-4" style={{ color: "var(--danger)" }} />
            </motion.button>

            {/* Accept */}
            <motion.button whileTap={{ scale: 0.9 }} onClick={accept} title="Accept"
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 animate-pulse"
              style={{ background: "rgba(34,197,94,0.15)" }}>
              <Phone className="w-4 h-4" style={{ color: "var(--success)" }} />
            </motion.button>
          </div>

          {/* Progress bar */}
          {countdown > 0 && (
            <div className="mt-3 h-0.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "var(--success)" }}
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