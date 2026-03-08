"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

// ✅ Ring tone for receiver using Web Audio API
function startRinging() {
  let stopped  = false;
  let ctx      = null;
  let timerId  = null;

  function ring() {
    if (stopped) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();

      // Two-tone ring (like a phone)
      [[800, 0, 0.3], [640, 0.35, 0.3]].forEach(([freq, delay, dur]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0,   ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + delay + 0.05);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0,   ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime  + delay + dur);
      });
    } catch {}
    if (!stopped) timerId = setTimeout(ring, 3000);
  }

  ring();

  return function stop() {
    stopped = true;
    if (timerId) clearTimeout(timerId);
    if (ctx) { ctx.close().catch(() => {}); ctx = null; }
  };
}

export default function IncomingCallAlert() {
  const router      = useRouter();
  const [incoming,  setIncoming]  = useState(null);
  const stopRingRef = useRef(null);

  useEffect(() => {
    const me   = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = me?.id || me?._id;
    if (!myId) return;

    connectSocket(myId).then((socket) => {
      console.log("🔔 IncomingCallAlert socket ready:", socket.id);
      registerListeners(socket);
    });

    function registerListeners(socket) {
      socket.off("call:incoming");
      socket.off("call:end");
      socket.off("call:rejected");

      socket.on("call:incoming", ({ from, fromName, offer, callType }) => {
        console.log("📞 INCOMING CALL:", { from, fromName, callType });
        // ✅ Start ringing
        if (stopRingRef.current) stopRingRef.current();
        stopRingRef.current = startRinging();
        setIncoming({ from, fromName, offer, callType });
      });

      socket.on("call:end", () => {
        stopRinging();
        setIncoming(null);
      });

      socket.on("call:rejected", () => {
        stopRinging();
        setIncoming(null);
      });

      socket.on("reconnect", () => registerListeners(socket));
    }

    return () => { stopRinging(); };
  }, []);

  function stopRinging() {
    if (stopRingRef.current) {
      stopRingRef.current();
      stopRingRef.current = null;
    }
  }

  function accept() {
    if (!incoming) return;
    stopRinging();
    sessionStorage.setItem("incomingCall", JSON.stringify({
      from:     incoming.from,
      fromName: incoming.fromName,
      offer:    incoming.offer,
      callType: incoming.callType,
    }));
    setIncoming(null);
    router.push(`/call?type=${incoming.callType}&from=${incoming.from}`);
  }

  function decline() {
    stopRinging();
    const s = getSocket();
    s?.emit("call:reject", { to: incoming?.from });
    setIncoming(null);
  }

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity:0, y:-100, scale:0.9 }}
          animate={{ opacity:1, y:0,    scale:1    }}
          exit={{   opacity:0, y:-100, scale:0.9   }}
          transition={{ type:"spring", damping:20, stiffness:300 }}
          className="fixed z-[9999] w-80 rounded-2xl p-4"
          style={{
            top:        "16px",
            left:       "50%",
            translateX: "-50%",
            background: "var(--bg-card)",
            border:     "1px solid var(--border)",
            boxShadow:  "0 8px 40px rgba(0,0,0,0.6)",
          }}>

          <div className="flex items-center gap-3">
            {/* Pulsing icon */}
            <div className="relative shrink-0 w-12 h-12">
              <motion.div
                animate={{ scale:[1,1.6,1], opacity:[0.4,0,0.4] }}
                transition={{ duration:1.5, repeat:Infinity }}
                className="absolute inset-0 rounded-full"
                style={{ background:"var(--success)" }} />
              <div className="absolute inset-0 rounded-full flex items-center justify-center z-10"
                style={{ background:"rgba(34,197,94,0.15)" }}>
                {incoming.callType === "video"
                  ? <Video className="w-5 h-5" style={{ color:"var(--success)" }} />
                  : <Phone className="w-5 h-5" style={{ color:"var(--success)" }} />}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs mb-0.5" style={{ color:"var(--fg-muted)" }}>
                Incoming {incoming.callType === "video" ? "Video" : "Voice"} Call
              </p>
              <p className="text-sm font-bold truncate" style={{ color:"var(--fg)" }}>
                {incoming.fromName || incoming.from}
              </p>
            </div>

            {/* Decline */}
            <motion.button whileTap={{ scale:0.9 }} onClick={decline}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background:"rgba(239,68,68,0.15)" }}>
              <PhoneOff className="w-4 h-4" style={{ color:"var(--danger)" }} />
            </motion.button>

            {/* Accept */}
            <motion.button whileTap={{ scale:0.9 }} onClick={accept}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background:"rgba(34,197,94,0.15)" }}>
              <Phone className="w-4 h-4" style={{ color:"var(--success)" }} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}