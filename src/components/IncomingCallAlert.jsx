"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

export default function IncomingCallAlert() {
  const router     = useRouter();
  const [incoming, setIncoming] = useState(null);

  useEffect(() => {
    const me   = JSON.parse(localStorage.getItem("user") || "{}");
    const myId = me?.id || me?._id;
    if (!myId) return;

    console.log("🔔 IncomingCallAlert init for userId:", myId);

    // ✅ Connect immediately and keep alive
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
        setIncoming({ from, fromName, offer, callType });
      });

      socket.on("call:end",      () => setIncoming(null));
      socket.on("call:rejected", () => setIncoming(null));

      // ✅ Re-register after reconnect
      socket.on("reconnect", () => {
        console.log("🔄 Reconnected — re-registering call listeners");
        registerListeners(socket);
      });
    }

    // ✅ Do NOT disconnect on unmount — keep socket alive for calls
    return () => {};
  }, []);

  function accept() {
    if (!incoming) return;
    console.log("✅ Accepting call:", incoming);
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
    const s = getSocket();
    s?.emit("call:reject", { to: incoming?.from });
    setIncoming(null);
  }

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity:0, y:-100 }}
          animate={{ opacity:1, y:0    }}
          exit={{   opacity:0, y:-100  }}
          transition={{ type:"spring", damping:20, stiffness:300 }}
          className="fixed top-4 left-1/2 z-[9999] w-80 rounded-2xl p-4"
          style={{
            transform:  "translateX(-50%)",
            background: "var(--bg-card)",
            border:     "1px solid var(--border)",
            boxShadow:  "0 8px 40px rgba(0,0,0,0.6)",
          }}>
          <div className="flex items-center gap-3">

            {/* Pulsing ring */}
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