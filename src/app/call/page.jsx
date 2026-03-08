"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Volume2, Loader2, AlertCircle
} from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302"  },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

function fmt(s) {
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

function Avatar({ name, size = 100 }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white"
      style={{ width:size, height:size, background:"linear-gradient(135deg,#6366f1,#06b6d4)", fontSize:size*0.35 }}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function CallScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const toUserId   = searchParams.get("userId"); // caller has this
  const fromUserId = searchParams.get("from");   // receiver has this
  const callType   = searchParams.get("type") || "video";
  const isCaller   = !!toUserId;

  const localVideoRef     = useRef(null);
  const remoteVideoRef    = useRef(null);
  const peerRef           = useRef(null);
  const localStream       = useRef(null);
  const pendingCandidates = useRef([]);
  const remoteDescReady   = useRef(false);

  const [callState, setCallState] = useState("init");
  const [micOn,     setMicOn]     = useState(true);
  const [camOn,     setCamOn]     = useState(callType === "video");
  const [duration,  setDuration]  = useState(0);
  const [permError, setPermError] = useState("");
  const [otherName, setOtherName] = useState("");
  const [me,        setMe]        = useState({});
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (callState !== "active") return;
    const id = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    if (!mounted) return;
    initCall();
    return () => cleanupMedia();
  }, [mounted]);

  async function initCall() {
    const myId   = me?.id || me?._id;
    const socket = await connectSocket(myId);
    console.log("📱 Call page socket:", socket.id, "| isCaller:", isCaller);

    // Register listeners
    socket.off("call:answer");
    socket.off("call:ice-candidate");
    socket.off("call:end");
    socket.off("call:rejected");

    socket.on("call:answer", async ({ answer }) => {
      try {
        console.log("📩 Received answer");
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescReady.current = true;
        for (const c of pendingCandidates.current) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidates.current = [];
        setCallState("active");
      } catch (e) { console.error("Answer error:", e); }
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      try {
        if (peerRef.current && remoteDescReady.current) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidates.current.push(candidate);
        }
      } catch (e) {}
    });

    socket.on("call:end", () => endCall(false));
    socket.on("call:rejected", () => {
      setCallState("rejected");
      setTimeout(() => router.back(), 2000);
    });

    if (isCaller) {
      await runCaller(socket);
    } else {
      await runReceiver(socket);
    }
  }

  async function runCaller(socket) {
    setCallState("requesting");
    const stream = await getMedia(callType);
    if (!stream) return;

    const peer  = buildPeer(stream, toUserId, socket);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("call:offer", { to: toUserId, offer, callType });
    console.log("📤 Offer sent to:", toUserId);
    setCallState("calling");
  }

  async function runReceiver(socket) {
    setCallState("requesting");

    const raw = sessionStorage.getItem("incomingCall");
    if (!raw) {
      console.error("❌ No incoming call data in sessionStorage");
      router.back();
      return;
    }

    const { offer, from, fromName, callType: ct } = JSON.parse(raw);
    sessionStorage.removeItem("incomingCall");
    setOtherName(fromName || from);
    console.log("📱 Receiver: got offer from:", from, "name:", fromName);

    const stream = await getMedia(ct);
    if (!stream) return;

    const peer = buildPeer(stream, from, socket);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescReady.current = true;

    for (const c of pendingCandidates.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c));
    }
    pendingCandidates.current = [];

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("call:answer", { to: from, answer });
    console.log("📤 Answer sent to:", from);
    setCallState("active");
  }

  async function getMedia(type) {
    const constraints = type === "video"
      ? { video: true, audio: true }
      : { video: false, audio: true };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      let msg = "Permission denied.";
      if (err.name === "NotAllowedError")  msg = "Camera/microphone permission denied. Click 🔒 in address bar to allow.";
      if (err.name === "NotFoundError")    msg = "No camera or microphone found.";
      if (err.name === "NotReadableError") msg = "Camera/microphone already in use by another app.";
      setPermError(msg);
      setCallState("error");
      return null;
    }
  }

  function buildPeer(stream, targetId, socket) {
    const peer = new RTCPeerConnection(ICE);
    peerRef.current = peer;

    stream.getTracks().forEach(t => peer.addTrack(t, stream));

    peer.ontrack = e => {
      console.log("🎥 Remote stream received");
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    peer.onicecandidate = e => {
      if (e.candidate) {
        socket.emit("call:ice-candidate", { to: targetId, candidate: e.candidate });
      }
    };

    peer.onconnectionstatechange = () => {
      console.log("🔗 Peer state:", peer.connectionState);
      if (peer.connectionState === "connected") setCallState("active");
      if (["disconnected","failed","closed"].includes(peer.connectionState)) endCall(false);
    };

    return peer;
  }

  function endCall(notify = true) {
    if (notify) {
      const target = toUserId || fromUserId;
      const socket = getSocket();
      if (target && socket) socket.emit("call:end", { to: target });
    }
    cleanupMedia();
    setCallState("ended");
    setTimeout(() => router.back(), 2000);
  }

  function cleanupMedia() {
    peerRef.current?.close();
    localStream.current?.getTracks().forEach(t => t.stop());
    const socket = getSocket();
    if (socket) {
      socket.off("call:answer");
      socket.off("call:ice-candidate");
      socket.off("call:end");
      socket.off("call:rejected");
    }
  }

  function toggleMic() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(m => !m);
  }

  function toggleCam() {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(c => !c);
  }

  // ── SCREENS ──
  if (callState === "error") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)" }}>
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-white mb-3">Permission Required</h2>
        <p className="text-sm leading-relaxed" style={{ color:"rgba(255,255,255,0.6)" }}>{permError}</p>
        <p className="text-xs mt-2" style={{ color:"rgba(255,255,255,0.35)" }}>
          Click 🔒 in your browser address bar → allow camera &amp; microphone
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => { const s = getSocket(); if(s) isCaller?runCaller(s):runReceiver(s); }}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background:"linear-gradient(135deg,#6366f1,#06b6d4)" }}>
          Try Again
        </button>
        <button onClick={() => router.back()}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background:"rgba(255,255,255,0.1)" }}>
          Go Back
        </button>
      </div>
    </div>
  );

  if (callState === "init" || callState === "requesting") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <Loader2 className="w-10 h-10 spin" style={{ color:"#6366f1" }} />
      <p className="text-white font-semibold">
        {callState === "init" ? "Connecting..." : "Requesting permission..."}
      </p>
      <p className="text-sm" style={{ color:"rgba(255,255,255,0.4)" }}>
        Allow {callType === "video" ? "camera and microphone" : "microphone"} access when prompted
      </p>
    </div>
  );

  if (callState === "rejected") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500">
        <PhoneOff className="w-7 h-7 text-white" />
      </div>
      <p className="text-white font-bold text-xl">Call Declined</p>
      <p className="text-sm" style={{ color:"rgba(255,255,255,0.4)" }}>Going back...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between"
      style={{ background: callType==="video" ? "#000" : "linear-gradient(135deg,#0f172a,#0a0e1a)", zIndex:100 }}>

      <video ref={remoteVideoRef} autoPlay playsInline
        className="absolute inset-0 w-full h-full object-cover" />

      <div className="absolute inset-0 pointer-events-none"
        style={{ background:"linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.8) 100%)" }} />

      <div className="relative z-10 flex flex-col items-center pt-16 gap-4">
        {(callType === "voice" || !camOn) && <Avatar name={otherName || "User"} size={100} />}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">
            {otherName || (isCaller ? "Calling..." : "Connecting...")}
          </h2>
          <p className="text-sm" style={{ color:"rgba(255,255,255,0.5)" }}>
            {callState === "calling" ? "Ringing... waiting for answer"
           : callState === "active"  ? fmt(duration)
           : "Connecting..."}
          </p>
        </div>
      </div>

      <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
        className="absolute top-20 right-4 z-20 rounded-2xl overflow-hidden"
        style={{ width:110, height:150, border:"2px solid rgba(255,255,255,0.2)" }}>
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </motion.div>

      <div className="relative z-10 flex items-center gap-5 pb-16">
        <motion.button whileTap={{ scale:0.9 }} onClick={toggleMic}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: micOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
          {micOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
        </motion.button>

        <motion.button whileTap={{ scale:0.9 }} onClick={() => endCall(true)}
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background:"#ef4444", boxShadow:"0 0 30px rgba(239,68,68,0.5)" }}>
          <PhoneOff className="w-7 h-7 text-white" />
        </motion.button>

        {callType === "video"
          ? <motion.button whileTap={{ scale:0.9 }} onClick={toggleCam}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: camOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
              {camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
            </motion.button>
          : <motion.button whileTap={{ scale:0.9 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background:"rgba(255,255,255,0.15)" }}>
              <Volume2 className="w-6 h-6 text-white" />
            </motion.button>
        }
      </div>

      <AnimatePresence>
        {callState === "ended" && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="absolute inset-0 flex items-center justify-center z-30"
            style={{ background:"rgba(0,0,0,0.8)" }}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <p className="text-xl font-bold text-white mb-1">Call Ended</p>
              <p className="text-sm" style={{ color:"rgba(255,255,255,0.5)" }}>{fmt(duration)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
        <Loader2 className="w-8 h-8 text-white spin" />
      </div>
    }>
      <CallScreen />
    </Suspense>
  );
}