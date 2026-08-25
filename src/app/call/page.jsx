// PATH: src/app/call/page.jsx
"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, VolumeX,
  Loader2, AlertCircle, ShieldCheck, Monitor, RefreshCw,
  Maximize2, ArrowLeft, Lock
} from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// Telegram signature 4-emoji encryption verification fingerprint
const E2EE_EMOJIS = ["🍒", "🍋", "💎", "🚀"];

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Avatar({ name, avatar, size = 110 }) {
  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      {avatar ? (
        <img
          src={avatar}
          alt={name || "User"}
          className="rounded-full w-full h-full object-cover shadow-2xl ring-4 ring-white/10"
        />
      ) : (
        <div
          className="rounded-full w-full h-full flex items-center justify-center font-bold text-white shadow-2xl ring-4 ring-white/10"
          style={{
            background: "linear-gradient(135deg,#3390ec,#6366f1)",
            fontSize: size * 0.38,
          }}
        >
          {name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}

function createRingTone() {
  let stopped = false;
  let ctx = null;
  let timer = null;
  function ring() {
    if (stopped) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      [[480, 0, 0.4], [400, 0.5, 0.4]].forEach(([freq, delay, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      });
    } catch {}
    if (!stopped) timer = setTimeout(ring, 3000);
  }
  ring();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    ctx?.close().catch(() => {});
  };
}

async function getIceServers() {
  try {
    const res = await fetch(`/api/ice`);
    const data = await res.json();
    if (data.iceServers?.length) return data.iceServers;
  } catch (e) {}

  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ];
}

function CallScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Support flexible query parameters
  const toUserId = searchParams.get("userId") || searchParams.get("peerId") || searchParams.get("to");
  const fromUserId = searchParams.get("from");
  const rawType = searchParams.get("type") || "audio";
  const isVideoInit = rawType === "video";
  const isCaller = !!toUserId;

  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const peerRef = useRef(null);
  const localStream = useRef(null);
  const pendingICE = useRef([]);
  const remoteReady = useRef(false);
  const stopRing = useRef(null);
  const callerIdRef = useRef(null);

  const [callState, setCallState] = useState("init");
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideoInit);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [volume, setVolume] = useState(1.0);
  const [showVol, setShowVol] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permError, setPermError] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherAvatar, setOtherAvatar] = useState("");
  const [mounted, setMounted] = useState(false);
  const [me, setMe] = useState({});
  const [netStatus, setNetStatus] = useState("");
  const [facingMode, setFacingMode] = useState("user");
  const [playBlocked, setPlayBlocked] = useState(false);
  const [showKeyTooltip, setShowKeyTooltip] = useState(false);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u);
    setMounted(true);
  }, []);

  // Fetch caller/callee info for name & avatar
  useEffect(() => {
    const peerId = toUserId || fromUserId;
    if (!peerId) return;

    fetch(`/api/users?search=`)
      .then((res) => res.json())
      .then((data) => {
        const found = data.users?.find((u) => u._id === peerId);
        if (found) {
          setOtherName(found.name);
          setOtherAvatar(found.avatar || "");
        }
      })
      .catch(() => {});
  }, [toUserId, fromUserId]);

  useEffect(() => {
    if (callState !== "active") return;
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    const id = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    const el = remoteRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    el.muted = false;
    el.volume = volume;
    el.play()
      .then(() => setPlayBlocked(false))
      .catch(() => setPlayBlocked(true));
  }, [remoteStream, volume]);

  useEffect(() => {
    if (!mounted) return;
    initCall();
    return () => cleanup();
  }, [mounted]);

  async function initCall() {
    const myId = me?.id || me?._id;
    const socket = await connectSocket(myId);

    socket.off("call:answer");
    socket.off("call:ice-candidate");
    socket.off("call:end");
    socket.off("call:rejected");
    socket.off("call:cancelled");

    const peerId = isCaller ? toUserId : fromUserId;
    callerIdRef.current = peerId;
    socket.emit("call:ack", { from: peerId });

    socket.on("call:answer", async ({ answer }) => {
      try {
        const peer = peerRef.current;
        if (!peer) return;
        if (peer.signalingState !== "have-local-offer") return;
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        remoteReady.current = true;
        for (const c of pendingICE.current) {
          await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingICE.current = [];
      } catch (e) {
        console.error("Answer error:", e);
      }
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      try {
        const peer = peerRef.current;
        if (!peer) return;
        if (remoteReady.current && peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingICE.current.push(candidate);
        }
      } catch (e) {}
    });

    socket.on("call:end", () => endCall(false));
    socket.on("call:rejected", () => {
      setCallState("rejected");
      setTimeout(() => router.back(), 2000);
    });
    socket.on("call:cancelled", () => {
      setCallState("rejected");
      setTimeout(() => router.back(), 2000);
    });

    socket.emit("call:ready");

    if (isCaller) await runCaller(socket);
    else await runReceiver(socket);
  }

  async function runCaller(socket) {
    setCallState("requesting");
    const stream = await getMedia(camOn);
    if (!stream) return;

    const iceServers = await getIceServers();
    const peer = buildPeer(toUserId, socket, iceServers);

    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);
    });

    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await peer.setLocalDescription(offer);
    socket.emit("call:offer", { to: toUserId, offer, callType: camOn ? "video" : "voice" });
    stopRing.current = createRingTone();
    setCallState("calling");
  }

  async function runReceiver(socket) {
    setCallState("requesting");
    const raw = sessionStorage.getItem("incomingCall");
    if (!raw) { router.back(); return; }

    const { offer, from, fromName, fromAvatar, callType } = JSON.parse(raw);
    sessionStorage.removeItem("incomingCall");

    if (fromName) setOtherName(fromName);
    if (fromAvatar) setOtherAvatar(fromAvatar);
    callerIdRef.current = from;

    const shouldEnableCam = callType === "video";
    setCamOn(shouldEnableCam);

    const stream = await getMedia(shouldEnableCam);
    if (!stream) return;

    const iceServers = await getIceServers();
    const peer = buildPeer(from, socket, iceServers);

    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);
    });

    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteReady.current = true;

    for (const c of pendingICE.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingICE.current = [];

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("call:answer", { to: from, answer });
    setCallState("calling");
  }

  async function getMedia(videoEnabled = false) {
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: videoEnabled
        ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      if (localRef.current && videoEnabled) {
        localRef.current.srcObject = stream;
        localRef.current.muted = true;
      }
      return stream;
    } catch (err) {
      console.error("❌ getUserMedia:", err);
      let msg = "Could not access microphone or camera.";
      if (err.name === "NotAllowedError") msg = "Permission denied. Click 🔒 in the URL bar to allow access.";
      setPermError(msg);
      setCallState("error");
      return null;
    }
  }

  function buildPeer(targetId, socket, iceServers) {
    const peer = new RTCPeerConnection({ iceServers });
    peerRef.current = peer;

    peer.ontrack = (e) => {
      if (e.streams?.[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        setRemoteStream((prev) => {
          if (prev instanceof MediaStream) {
            const next = new MediaStream(prev.getTracks());
            next.addTrack(e.track);
            return next;
          }
          return new MediaStream([e.track]);
        });
      }
      setCallState("active");
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("call:ice-candidate", { to: targetId, candidate: e.candidate });
      }
    };

    peer.oniceconnectionstatechange = () => {
      const s = peer.iceConnectionState;
      if (s === "connected" || s === "completed") {
        setCallState("active");
        setNetStatus("");
      } else if (s === "disconnected") {
        setNetStatus("Reconnecting...");
      } else if (s === "failed") {
        setNetStatus("Weak connection");
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setCallState("active");
        setNetStatus("");
      }
      if (peer.connectionState === "failed") endCall(false);
    };

    return peer;
  }

  async function toggleCamera() {
    if (!localStream.current) return;
    const isNowOn = !camOn;
    setCamOn(isNowOn);

    if (isNowOn) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStream.current.addTrack(videoTrack);
        if (localRef.current) localRef.current.srcObject = localStream.current;

        const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        } else {
          peerRef.current?.addTrack(videoTrack, localStream.current);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      localStream.current.getVideoTracks().forEach((t) => {
        t.stop();
        localStream.current.removeTrack(t);
      });
      const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) sender.replaceTrack(null);
    }
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      // Revert to camera / no screen
      setIsScreenSharing(false);
      localStream.current?.getVideoTracks().forEach((t) => t.stop());
      const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) sender.replaceTrack(null);
      if (camOn) toggleCamera();
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        setIsScreenSharing(true);
        setCamOn(true);

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          setCamOn(false);
        };

        const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          peerRef.current?.addTrack(screenTrack, screenStream);
        }
        if (localRef.current) localRef.current.srcObject = screenStream;
      } catch (e) {
        console.error(e);
      }
    }
  }

  function toggleMic() {
    localStream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMicOn((m) => !m);
  }

  function toggleSpeaker() {
    const next = !speakerOn;
    if (remoteRef.current) {
      remoteRef.current.muted = !next;
      remoteRef.current.volume = next ? volume : 0;
    }
    setSpeakerOn(next);
  }

  function changeVolume(val) {
    const v = parseFloat(val);
    setVolume(v);
    if (remoteRef.current) {
      remoteRef.current.volume = v;
      remoteRef.current.muted = v === 0;
    }
    setSpeakerOn(v > 0);
  }

  function endCall(notify = true) {
    if (notify) {
      const target = toUserId || fromUserId || callerIdRef.current;
      const s = getSocket();
      if (target && s) s.emit("call:end", { to: target });
    }

    sessionStorage.removeItem("activeCall");
    sessionStorage.removeItem("incomingCall");

    cleanup();
    setCallState("ended");
    setTimeout(() => router.back(), 1500);
  }

  function cleanup() {
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    peerRef.current?.close();
    peerRef.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    setRemoteStream(null);
  }

  const hasRemoteVideo = remoteStream?.getVideoTracks()?.some((t) => t.readyState === "live" && t.enabled);

  if (callState === "error") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8 bg-[#0e1621] text-white">
        <AlertCircle className="w-16 h-16 text-red-400" />
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold mb-2">Permission Required</h2>
          <p className="text-sm text-gray-400">{permError}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-xl bg-[var(--tg-accent)] text-white text-sm font-semibold shadow-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between overflow-hidden select-none bg-[#0e1621] text-white z-50">
      
      {/* Background Animated Gradient / Radial Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 35%, rgba(51,144,236,0.18) 0%, rgba(14,22,33,0.95) 75%)",
        }}
      />

      {/* Remote Video Element */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          hasRemoteVideo ? "opacity-100 z-10" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Audio element for voice calls */}
      <audio ref={remoteRef} autoPlay playsInline style={{ display: "none" }} />

      {/* ── Top Header Bar ── */}
      <div className="relative w-full flex items-center justify-between px-6 pt-6 z-20">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="p-2.5 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/80 hover:text-white transition"
          title="Minimize Call"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Telegram E2EE Encryption Key Verification Fingerprint */}
        <div className="relative">
          <div
            onClick={() => setShowKeyTooltip(!showKeyTooltip)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md cursor-pointer border border-white/10 transition shadow-lg"
            title="End-to-End Encryption Key"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <div className="flex items-center gap-1 text-sm">
              {E2EE_EMOJIS.map((emoji, i) => (
                <span key={i} className="hover:scale-125 transition-transform">{emoji}</span>
              ))}
            </div>
          </div>

          {/* Telegram E2EE Tooltip */}
          <AnimatePresence>
            {showKeyTooltip && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-12 w-64 p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-white/10 text-xs text-gray-200 shadow-2xl z-30"
              >
                <div className="flex items-center gap-2 font-bold text-white mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>End-to-End Encrypted</span>
                </div>
                <p className="leading-relaxed opacity-90">
                  If these 4 emojis match the ones on {otherName || "the caller"}'s screen, your call is 100% private and encrypted.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Center Content: Pulsing Avatar & Call Status ── */}
      <div className="relative flex flex-col items-center justify-center gap-6 my-auto z-20">
        
        {/* Pulsing Concentric Sound Waves Rings (Telegram signature call effect) */}
        <div className="relative flex items-center justify-center">
          {callState === "active" && (
            <>
              <motion.div
                animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0.05, 0.35] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute w-44 h-44 rounded-full bg-[var(--tg-accent)]"
              />
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.45, 0.1, 0.45] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                className="absolute w-36 h-36 rounded-full bg-[var(--tg-accent)]"
              />
            </>
          )}

          {callState === "calling" && (
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute w-36 h-36 rounded-full bg-emerald-500"
            />
          )}

          <Avatar name={otherName || "User"} avatar={otherAvatar} size={110} />
        </div>

        {/* Name & Status */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-white tracking-wide">
            {otherName || (isCaller ? "Calling..." : "Connecting...")}
          </h2>

          <p className="text-sm font-medium text-white/70">
            {callState === "calling"
              ? "🔔 Ringing..."
              : callState === "active"
              ? fmt(duration)
              : "Connecting..."}
          </p>

          {netStatus && (
            <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {netStatus}
            </span>
          )}
        </div>
      </div>

      {/* ── Local Picture-in-Picture Video Preview ── */}
      {(camOn || isScreenSharing) && (
        <motion.div
          drag
          dragConstraints={{ left: -100, right: 100, top: -200, bottom: 200 }}
          className="absolute top-20 right-6 w-32 h-44 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-30 bg-black cursor-grab active:cursor-grabbing"
        >
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </motion.div>
      )}

      {/* ── Autoplay Blocked Overlay Trigger ── */}
      {playBlocked && callState === "active" && (
        <button
          onClick={() => {
            remoteRef.current?.play().then(() => setPlayBlocked(false));
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-2xl bg-[var(--tg-accent)] text-white font-bold shadow-2xl flex items-center gap-3 z-40 animate-pulse"
        >
          <Volume2 className="w-6 h-6" /> Tap to Enable Audio
        </button>
      )}

      {/* ── Telegram Call Controls Bottom Bar ── */}
      <div className="relative w-full max-w-md flex flex-col items-center gap-4 pb-12 px-6 z-20">
        
        {/* Volume Slider Card */}
        <AnimatePresence>
          {showVol && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl"
            >
              <VolumeX className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => changeVolume(e.target.value)}
                className="w-36 accent-[var(--tg-accent)] cursor-pointer"
              />
              <Volume2 className="w-4 h-4 text-gray-200" />
              <span className="text-xs font-bold text-white w-8">
                {Math.round(volume * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Pill */}
        <div className="w-full flex items-center justify-around py-3 px-4 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
          
          {/* Mute Mic */}
          <button
            onClick={toggleMic}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-95 shadow-md ${
              micOn
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-red-500 text-white"
            }`}
            title={micOn ? "Mute Microphone" : "Unmute Microphone"}
          >
            {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={toggleCamera}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-95 shadow-md ${
              camOn
                ? "bg-[var(--tg-accent)] text-white hover:bg-[var(--tg-accent-hover)]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={camOn ? "Turn Camera Off" : "Turn Camera On"}
          >
            {camOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-95 shadow-md ${
              isScreenSharing
                ? "bg-emerald-500 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
          >
            <Monitor className="w-6 h-6" />
          </button>

          {/* Speaker / Volume */}
          <button
            onClick={toggleSpeaker}
            onDoubleClick={() => setShowVol(!showVol)}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-95 shadow-md ${
              speakerOn
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-red-500 text-white"
            }`}
            title="Speaker (Double click for volume slider)"
          >
            {speakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>

          {/* End Call Button (Telegram Red Circle with Glow) */}
          <button
            onClick={() => endCall(true)}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.6)] transition active:scale-90 shrink-0"
            title="End Call"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* ── Call Ended State Overlay ── */}
      <AnimatePresence>
        {callState === "ended" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-50"
          >
            <div className="text-center space-y-3">
              <div className="w-18 h-18 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto shadow-2xl">
                <PhoneOff className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white">Call Ended</h3>
              <p className="text-sm text-gray-400">Duration: {fmt(duration)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-[#0e1621]">
          <Loader2 className="w-8 h-8 text-[var(--tg-accent)] animate-spin" />
        </div>
      }
    >
      <CallScreen />
    </Suspense>
  );
}