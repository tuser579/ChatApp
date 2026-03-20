// PATH: src/app/call/page.jsx
"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, VolumeX, Loader2, AlertCircle } from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "https://nexchat-backend-az2d.onrender.com";

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Avatar({ name, size = 100 }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, background: "linear-gradient(135deg,#6366f1,#06b6d4)", fontSize: size * 0.35 }}>
      {name?.[0]?.toUpperCase() || "?"}
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
        osc.connect(gain); gain.connect(ctx.destination);
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
  return () => { stopped = true; if (timer) clearTimeout(timer); ctx?.close().catch(() => {}); };
}

async function getIceServers() {
  try {
    const res  = await fetch(`${BACKEND}/api/ice`);
    const data = await res.json();
    console.log("🧊 Got ICE servers:", data.iceServers?.length);
    return data.iceServers;
  } catch (e) {
    console.warn("ICE fetch failed, using fallback:", e.message);
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "turn:openrelay.metered.ca:80",                username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function CallScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const toUserId     = searchParams.get("userId");  // set when YOU are the caller
  const fromUserId   = searchParams.get("from");    // set when YOU are the callee
  const callType     = searchParams.get("type") || "voice";
  const isCaller     = !!toUserId;

  const localRef    = useRef(null);
  const remoteRef   = useRef(null);
  const peerRef     = useRef(null);
  const localStream = useRef(null);
  const pendingICE  = useRef([]);
  const remoteReady = useRef(false);
  const stopRing    = useRef(null);
  const callerIdRef = useRef(null); // ✅ store peer id for ack + cleanup

  const [callState,   setCallState]   = useState("init");
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn,       setMicOn]       = useState(true);
  const [camOn,       setCamOn]       = useState(callType === "video");
  const [speakerOn,   setSpeakerOn]   = useState(true);
  const [volume,      setVolume]      = useState(1.0);
  const [showVol,     setShowVol]     = useState(false);
  const [duration,    setDuration]    = useState(0);
  const [permError,   setPermError]   = useState("");
  const [otherName,   setOtherName]   = useState("");
  const [mounted,     setMounted]     = useState(false);
  const [me,          setMe]          = useState({});
  const [netStatus,   setNetStatus]   = useState("");
  const [facingMode,  setFacingMode]  = useState("user");
  const [playBlocked, setPlayBlocked] = useState(false);

  // ── Init: load user from localStorage ──────────────────────────────────
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u);
    setMounted(true);
  }, []);

  // ── Duration timer — only runs when call is active ──────────────────────
  useEffect(() => {
    if (callState !== "active") return;
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    const id = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  // ── Attach remoteStream to DOM element ───────────────────────────────────
  useEffect(() => {
    const el = remoteRef.current;
    if (!el || !remoteStream) return;
    console.log("🎵 Attaching remoteStream, tracks:",
      remoteStream.getTracks().map(t => t.kind + ":" + t.readyState));
    el.srcObject = remoteStream;
    el.muted  = false;
    el.volume = volume;
    el.play()
      .then(() => { console.log("▶️ Remote audio playing!"); setPlayBlocked(false); })
      .catch(err => { console.warn("⚠️ Autoplay blocked:", err.message); setPlayBlocked(true); });
  }, [remoteStream, volume]);

  // ── Main call init — runs once mounted ──────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    initCall();
    return () => cleanup();
  }, [mounted]);

  // ─────────────────────────────────────────────────────────────────────────
  async function initCall() {
    const myId   = me?.id || me?._id;
    const socket = await connectSocket(myId);

    // Clean up stale listeners before attaching fresh ones
    socket.off("call:answer");
    socket.off("call:ice-candidate");
    socket.off("call:end");
    socket.off("call:rejected");
    socket.off("call:cancelled");

    // ✅ FIX: Emit call:ack immediately so server deletes pending
    // and stops re-delivering call:incoming to IncomingCallAlert
    const peerId = isCaller ? toUserId : fromUserId;
    callerIdRef.current = peerId;
    socket.emit("call:ack", { from: peerId });
    console.log("📋 call:ack sent for peer:", peerId);

    // ── Socket listeners ──────────────────────────────────────────────────

    socket.on("call:answer", async ({ answer }) => {
      try {
        console.log("📩 Got answer");
        const peer = peerRef.current;
        if (!peer) return;
        if (peer.signalingState !== "have-local-offer") {
          console.warn("Wrong signaling state for answer:", peer.signalingState);
          return;
        }
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        remoteReady.current = true;
        console.log("✅ Remote set, flushing", pendingICE.current.length, "ICE candidates");
        for (const c of pendingICE.current) {
          await peer.addIceCandidate(new RTCIceCandidate(c))
            .catch(e => console.warn("ICE flush:", e.message));
        }
        pendingICE.current = [];
      } catch (e) { console.error("Answer error:", e); }
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
      } catch (e) { console.warn("ICE add:", e.message); }
    });

    socket.on("call:end",       () => endCall(false));
    socket.on("call:rejected",  () => { setCallState("rejected"); setTimeout(() => router.back(), 2000); });
    socket.on("call:cancelled", () => { setCallState("rejected"); setTimeout(() => router.back(), 2000); });

    // Signal server we are ready to receive ICE
    socket.emit("call:ready");

    if (isCaller) await runCaller(socket);
    else          await runReceiver(socket);
  }

  // ── Caller side ───────────────────────────────────────────────────────────
  async function runCaller(socket) {
    setCallState("requesting");
    const stream = await getMedia();
    if (!stream) return;

    const iceServers = await getIceServers();
    const peer = buildPeer(toUserId, socket, iceServers);

    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
      console.log("➕ Added track:", track.kind);
    });

    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === "video",
    });
    await peer.setLocalDescription(offer);
    socket.emit("call:offer", { to: toUserId, offer, callType });
    console.log("📤 Offer sent to:", toUserId);
    stopRing.current = createRingTone();
    setCallState("calling");
  }

  // ── Callee side ───────────────────────────────────────────────────────────
  async function runReceiver(socket) {
    setCallState("requesting");
    const raw = sessionStorage.getItem("incomingCall");
    if (!raw) { router.back(); return; }

    const { offer, from, fromName } = JSON.parse(raw);

    // ✅ FIX: Remove incomingCall from sessionStorage immediately
    // so IncomingCallAlert ignores any re-delivered call:incoming for this call
    sessionStorage.removeItem("incomingCall");

    setOtherName(fromName || from);
    callerIdRef.current = from;

    const stream = await getMedia();
    if (!stream) return;

    const iceServers = await getIceServers();
    const peer = buildPeer(from, socket, iceServers);

    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
      console.log("➕ Added track:", track.kind);
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
    console.log("📤 Answer sent");
    setCallState("calling");
  }

  // ── Get user media ────────────────────────────────────────────────────────
  async function getMedia() {
    const constraints = callType === "video"
      ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      if (localRef.current && callType === "video") {
        localRef.current.srcObject = stream;
        localRef.current.muted = true;
      }
      return stream;
    } catch (err) {
      console.error("❌ getUserMedia:", err.name, err.message);
      let msg = "Could not access microphone.";
      if (err.name === "NotAllowedError")  msg = "Microphone permission denied. Click 🔒 in address bar → allow.";
      if (err.name === "NotFoundError")    msg = "No microphone found.";
      if (err.name === "NotReadableError") msg = "Microphone in use by another app.";
      setPermError(msg);
      setCallState("error");
      return null;
    }
  }

  // ── Build RTCPeerConnection ───────────────────────────────────────────────
  function buildPeer(targetId, socket, iceServers) {
    console.log("🔧 Building RTCPeerConnection with", iceServers.length, "ICE servers");
    const peer = new RTCPeerConnection({ iceServers });
    peerRef.current = peer;

    peer.ontrack = (e) => {
      console.log("🎵 ontrack:", e.track.kind, "streams:", e.streams.length,
        "readyState:", e.track.readyState);
      if (e.streams?.[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        setRemoteStream(prev => {
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
      console.log("🧊 ICE:", s);
      if (s === "connected" || s === "completed" || s === "checking") {
        setCallState("active");
        setNetStatus("");
      } else if (s === "disconnected") {
        setNetStatus("reconnecting...");
      } else if (s === "failed") {
        setNetStatus("Connection failed");
        console.error("❌ ICE failed — trying restart");
        if (isCaller && peer.signalingState === "stable") {
          peer.createOffer({ iceRestart: true }).then(offer => {
            peer.setLocalDescription(offer);
            getSocket()?.emit("call:offer", { to: toUserId, offer, callType });
          }).catch(() => {});
        }
      } else {
        setNetStatus("");
      }
    };

    peer.onconnectionstatechange = () => {
      console.log("🔗 Connection:", peer.connectionState);
      if (peer.connectionState === "connected") { setCallState("active"); setNetStatus(""); }
      if (peer.connectionState === "failed")    endCall(false);
    };

    return peer;
  }

  // ── Switch camera (mobile) ────────────────────────────────────────────────
  async function switchCamera() {
    if (callType !== "video" || !localStream.current) return;
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    localStream.current.getVideoTracks().forEach(t => t.stop());
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: nextMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldTracks = localStream.current.getTracks();
      localStream.current = new MediaStream([newVideoTrack, ...oldTracks.filter(t => t.kind === "audio")]);
      if (localRef.current) localRef.current.srcObject = localStream.current;
      const sender = peerRef.current?.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(newVideoTrack);
    } catch (e) { console.error("Camera switch error:", e); }
  }

  // ── End call ──────────────────────────────────────────────────────────────
  function endCall(notify = true) {
    if (notify) {
      const target = toUserId || fromUserId || callerIdRef.current;
      const s = getSocket();
      if (target && s) s.emit("call:end", { to: target });
    }

    // ✅ FIX: Clean up sessionStorage so IncomingCallAlert works for next call
    sessionStorage.removeItem("activeCall");
    sessionStorage.removeItem("incomingCall");

    cleanup();
    setCallState("ended");
    setTimeout(() => router.back(), 2000);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    peerRef.current?.close();
    peerRef.current = null;
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    setRemoteStream(null);
    const s = getSocket();
    if (s) {
      s.off("call:answer");
      s.off("call:ice-candidate");
      s.off("call:end");
      s.off("call:rejected");
      s.off("call:cancelled");
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function toggleMic() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(m => !m);
  }
  function toggleCam() {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(c => !c);
  }
  function toggleSpeaker() {
    const next = !speakerOn;
    if (remoteRef.current) { remoteRef.current.muted = !next; remoteRef.current.volume = next ? volume : 0; }
    setSpeakerOn(next);
  }
  function changeVolume(val) {
    const v = parseFloat(val);
    setVolume(v);
    if (remoteRef.current) { remoteRef.current.volume = v; remoteRef.current.muted = v === 0; }
    setSpeakerOn(v > 0);
  }

  // ── Error / loading screens ───────────────────────────────────────────────
  if (callState === "error") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style={{ background: "linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <AlertCircle className="w-16 h-16 text-red-400" />
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-white mb-3">Permission Required</h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{permError}</p>
      </div>
      <button onClick={() => router.back()} className="px-6 py-3 rounded-xl text-white text-sm font-semibold"
        style={{ background: "rgba(255,255,255,0.1)" }}>Go Back</button>
    </div>
  );

  if (callState === "init" || callState === "requesting") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: "linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#6366f1" }} />
      <p className="text-white font-semibold">
        {callState === "init" ? "Connecting..." : "Requesting microphone..."}
      </p>
    </div>
  );

  if (callState === "rejected") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: "linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500">
        <PhoneOff className="w-7 h-7 text-white" />
      </div>
      <p className="text-white font-bold text-xl">Call Declined</p>
    </div>
  );

  // ── Main call UI ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between"
      style={{ background: "linear-gradient(135deg,#0f172a,#0a0e1a)", zIndex: 100 }}>

      {/* Remote audio element (voice calls) */}
      {callType !== "video" && (
        <audio ref={remoteRef} autoPlay playsInline style={{ display: "none" }} />
      )}

      {/* Remote video element (video calls) */}
      {callType === "video" && (
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 1 }}
        />
      )}

      {/* ✅ Autoplay blocked fallback button */}
      <AnimatePresence>
        {playBlocked && callState === "active" && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => {
              remoteRef.current?.play()
                .then(() => setPlayBlocked(false))
                .catch(() => {});
            }}
            className="absolute z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-2xl flex flex-col items-center gap-2"
            style={{ background: "rgba(99,102,241,0.9)", backdropFilter: "blur(12px)", color: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            <Volume2 className="w-8 h-8" />
            <span className="font-bold">Tap to enable audio</span>
            <span className="text-xs opacity-80 text-center">Your browser blocked automatic sound</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        zIndex: 2,
        background: "linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.8) 100%)"
      }} />

      {/* Top — avatar + name + status */}
      <div className="relative flex flex-col items-center pt-16 gap-4" style={{ zIndex: 3 }}>
        <Avatar name={otherName || "User"} size={100} />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">
            {otherName || (isCaller ? "Calling..." : "Connected")}
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            {callState === "calling" ? "🔔 Ringing..."
              : callState === "active" ? fmt(duration)
              : "Connecting..."}
          </p>
          {netStatus && (
            <p className="text-xs mt-1 px-3 py-1 rounded-full inline-block"
              style={{ background: "rgba(239,68,68,0.15)", color: "rgba(255,180,180,0.9)" }}>
              ⚠️ {netStatus}
            </p>
          )}
        </div>
      </div>

      {/* Local PiP video */}
      {callType === "video" && (
        <div className="absolute top-20 right-4 rounded-2xl overflow-hidden"
          style={{ width: 110, height: 150, border: "2px solid rgba(255,255,255,0.2)", zIndex: 10 }}>
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
      )}

      {/* Controls */}
      <div className="relative flex flex-col items-center gap-4 pb-16" style={{ zIndex: 3 }}>

        {/* Volume slider */}
        <AnimatePresence>
          {showVol && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}>
              <span className="text-white text-xs">🔈</span>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={e => changeVolume(e.target.value)}
                style={{ accentColor: "white", cursor: "pointer", width: "128px" }} />
              <span className="text-white text-xs">🔊</span>
              <span className="text-white text-xs font-bold" style={{ width: "32px" }}>
                {Math.round(volume * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-5">
          {/* Mic */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMic}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: micOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            {micOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
          </motion.button>

          {/* End call */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => endCall(true)}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "#ef4444", boxShadow: "0 0 30px rgba(239,68,68,0.5)" }}>
            <PhoneOff className="w-7 h-7 text-white" />
          </motion.button>

          {/* Speaker */}
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={toggleSpeaker} onDoubleClick={() => setShowVol(v => !v)}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: speakerOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            {speakerOn ? <Volume2 className="w-6 h-6 text-white" /> : <VolumeX className="w-6 h-6 text-white" />}
          </motion.button>

          {/* Switch camera */}
          {callType === "video" && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={switchCamera}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <motion.div animate={{ rotate: facingMode === "user" ? 0 : 180 }}>
                <Video className="w-6 h-6 text-white" />
              </motion.div>
            </motion.button>
          )}

          {/* Toggle camera */}
          {callType === "video" && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleCam}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: camOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
              {camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
            </motion.button>
          )}
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Tap 🔊 to mute · Double tap for volume
        </p>
      </div>

      {/* Call ended overlay */}
      <AnimatePresence>
        {callState === "ended" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.85)", zIndex: 50 }}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <p className="text-xl font-bold text-white mb-1">Call Ended</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{fmt(duration)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page wrapper with Suspense ────────────────────────────────────────────────
export default function CallPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    }>
      <CallScreen />
    </Suspense>
  );
}