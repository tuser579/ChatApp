"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Volume2, Loader2, AlertCircle
} from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302"  },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    {
      urls:       "turn:openrelay.metered.ca:80",
      username:   "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls:       "turn:openrelay.metered.ca:443",
      username:   "openrelayproject",
      credential: "openrelayproject",
    },
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

// ✅ Ring tone using Web Audio API — no file needed
function createRingTone(audioCtx) {
  let stopped = false;
  let timeoutId = null;

  function playBeep() {
    if (stopped) return;
    try {
      const osc    = audioCtx.createOscillator();
      const gainN  = audioCtx.createGain();
      osc.connect(gainN);
      gainN.connect(audioCtx.destination);
      osc.type      = "sine";
      osc.frequency.setValueAtTime(480, audioCtx.currentTime);
      gainN.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainN.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {}
    if (!stopped) timeoutId = setTimeout(playBeep, 2000);
  }

  playBeep();
  return () => { stopped = true; if (timeoutId) clearTimeout(timeoutId); };
}

function CallScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const toUserId   = searchParams.get("userId");
  const fromUserId = searchParams.get("from");
  const callType   = searchParams.get("type") || "video";
  const isCaller   = !!toUserId;

  const localRef      = useRef(null);
  const remoteRef     = useRef(null);
  const peerRef       = useRef(null);
  const localStream   = useRef(null);
  const remoteStream  = useRef(null);
  const pendingICE    = useRef([]);
  const remoteReady   = useRef(false);
  const stopRing      = useRef(null);
  const audioCtxRef   = useRef(null);

  const [callState, setCallState] = useState("init");
  const [micOn,      setMicOn]     = useState(true);
  const [camOn,      setCamOn]     = useState(callType === "video");
  const [speakerOn,  setSpeakerOn] = useState(true);
  const [volume,     setVolume]    = useState(1.0);
  const [showVol,    setShowVol]   = useState(false);
  const [duration,   setDuration]  = useState(0);
  const [permError,  setPermError] = useState("");
  const [otherName,  setOtherName] = useState("");
  const [mounted,    setMounted]   = useState(false);
  const [me,         setMe]        = useState({});

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (callState !== "active") return;
    // ✅ Stop ringing when call connects
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    const id = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    if (!mounted) return;
    initCall();
    return () => cleanup();
  }, [mounted]);

  // ✅ Start audio context (must be triggered by user gesture or after mount)
  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  async function initCall() {
    const myId   = me?.id || me?._id;
    const socket = await connectSocket(myId);

    socket.off("call:answer");
    socket.off("call:ice-candidate");
    socket.off("call:end");
    socket.off("call:rejected");

    socket.on("call:answer", async ({ answer }) => {
      try {
        console.log("📩 Got answer");
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        remoteReady.current = true;
        for (const c of pendingICE.current) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingICE.current = [];
      } catch (e) { console.error("Answer error:", e); }
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      try {
        if (peerRef.current && remoteReady.current) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingICE.current.push(candidate);
        }
      } catch {}
    });

    socket.on("call:end",      () => endCall(false));
    socket.on("call:rejected", () => { setCallState("rejected"); setTimeout(() => router.back(), 2000); });

    if (isCaller) await runCaller(socket);
    else          await runReceiver(socket);
  }

  async function runCaller(socket) {
    setCallState("requesting");
    const stream = await getMedia();
    if (!stream) return;

    // ✅ Play ring tone for caller
    const ctx = getAudioCtx();
    stopRing.current = createRingTone(ctx);
    setCallState("calling");

    const peer  = buildPeer(stream, toUserId, socket);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("call:offer", { to: toUserId, offer, callType });
    console.log("📤 Offer sent to:", toUserId);
  }

  async function runReceiver(socket) {
    setCallState("requesting");

    const raw = sessionStorage.getItem("incomingCall");
    if (!raw) { router.back(); return; }

    const { offer, from, fromName } = JSON.parse(raw);
    sessionStorage.removeItem("incomingCall");
    setOtherName(fromName || from);

    const stream = await getMedia();
    if (!stream) return;

    const peer = buildPeer(stream, from, socket);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteReady.current = true;

    for (const c of pendingICE.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingICE.current = [];

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("call:answer", { to: from, answer });
    setCallState("active");
  }

  async function getMedia() {
    const constraints = callType === "video"
      ? { video: { width:1280, height:720 }, audio: { echoCancellation:true, noiseSuppression:true, sampleRate:44100 } }
      : { video: false, audio: { echoCancellation:true, noiseSuppression:true, sampleRate:44100 } };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      if (localRef.current) {
        localRef.current.srcObject = stream;
        localRef.current.muted = true; // ✅ mute local to prevent echo
      }
      return stream;
    } catch (err) {
      let msg = "Permission denied.";
      if (err.name === "NotAllowedError")  msg = "Camera/microphone permission denied.";
      if (err.name === "NotFoundError")    msg = "No camera or microphone found.";
      if (err.name === "NotReadableError") msg = "Camera/mic already in use by another app.";
      setPermError(msg);
      setCallState("error");
      return null;
    }
  }

  function buildPeer(stream, targetId, socket) {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    // ✅ Add all tracks
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
      console.log("🎵 Added track:", track.kind);
    });

    // ✅ Handle remote stream — attach to audio/video element
    peer.ontrack = (e) => {
      console.log("🎥 Remote track received:", e.track.kind);
      if (!remoteStream.current) {
        remoteStream.current = new MediaStream();
      }
      remoteStream.current.addTrack(e.track);

      if (remoteRef.current) {
        remoteRef.current.srcObject = remoteStream.current;
        // ✅ Force play with sound
        remoteRef.current.muted  = false;
        remoteRef.current.volume = 1.0;
        remoteRef.current.play().catch(err => {
          console.warn("Autoplay blocked:", err);
        });
      }
      setCallState("active");
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("call:ice-candidate", { to: targetId, candidate: e.candidate });
      }
    };

    peer.onconnectionstatechange = () => {
      console.log("🔗 Peer state:", peer.connectionState);
      if (peer.connectionState === "connected")                          setCallState("active");
      if (["disconnected","failed","closed"].includes(peer.connectionState)) endCall(false);
    };

    peer.onicegatheringstatechange = () => {
      console.log("🧊 ICE gathering:", peer.iceGatheringState);
    };

    return peer;
  }

  function endCall(notify = true) {
    if (notify) {
      const target = toUserId || fromUserId;
      const s      = getSocket();
      if (target && s) s.emit("call:end", { to: target });
    }
    cleanup();
    setCallState("ended");
    setTimeout(() => router.back(), 2000);
  }

  function cleanup() {
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    peerRef.current?.close();
    localStream.current?.getTracks().forEach(t => t.stop());
    remoteStream.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    const s = getSocket();
    if (s) {
      s.off("call:answer");
      s.off("call:ice-candidate");
      s.off("call:end");
      s.off("call:rejected");
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

  // ✅ Speaker toggle
  function toggleSpeaker() {
    const next = !speakerOn;
    if (remoteRef.current) {
      remoteRef.current.muted  = !next;
      remoteRef.current.volume = next ? volume : 0;
    }
    setSpeakerOn(next);
  }

  // ✅ Volume control
  function changeVolume(val) {
    const v = parseFloat(val);
    setVolume(v);
    if (remoteRef.current) {
      remoteRef.current.volume = v;
      remoteRef.current.muted  = v === 0;
    }
    setSpeakerOn(v > 0);
  }

  // ── Error screen ──
  if (callState === "error") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background:"rgba(239,68,68,0.15)" }}>
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-white mb-3">Permission Required</h2>
        <p className="text-sm leading-relaxed" style={{ color:"rgba(255,255,255,0.6)" }}>{permError}</p>
        <p className="text-xs mt-2" style={{ color:"rgba(255,255,255,0.35)" }}>
          Click 🔒 in address bar → allow camera &amp; microphone
        </p>
      </div>
      <button onClick={() => router.back()}
        className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background:"rgba(255,255,255,0.1)" }}>
        Go Back
      </button>
    </div>
  );

  // ── Loading screen ──
  if (callState === "init" || callState === "requesting") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <Loader2 className="w-10 h-10 spin" style={{ color:"#6366f1" }} />
      <p className="text-white font-semibold">
        {callState === "init" ? "Connecting..." : "Requesting permission..."}
      </p>
    </div>
  );

  // ── Rejected screen ──
  if (callState === "rejected") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500">
        <PhoneOff className="w-7 h-7 text-white" />
      </div>
      <p className="text-white font-bold text-xl">Call Declined</p>
    </div>
  );

  // ── Active call screen ──
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between"
      style={{ background: callType==="video" ? "#000" : "linear-gradient(135deg,#0f172a,#0a0e1a)", zIndex:100 }}>

      {/* ✅ Remote video/audio — NOT muted */}
      {callType === "video"
        ? <video ref={remoteRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex:1 }} />
        : <audio ref={remoteRef} autoPlay
            style={{ display:"none" }} />
      }

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex:2,
        background:"linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.8) 100%)" }} />

      {/* Top info */}
      <div className="relative z-10 flex flex-col items-center pt-16 gap-4">
        {(callType === "voice" || !camOn) && <Avatar name={otherName || "User"} size={100} />}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">
            {otherName || (isCaller ? "Calling..." : "Connected")}
          </h2>
          <p className="text-sm" style={{ color:"rgba(255,255,255,0.5)" }}>
            {callState === "calling" ? "🔔 Ringing..."
           : callState === "active"  ? fmt(duration)
           : "Connecting..."}
          </p>
        </div>
      </div>

      {/* Local video preview */}
      {callType === "video" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          className="absolute top-20 right-4 z-20 rounded-2xl overflow-hidden"
          style={{ width:110, height:150, border:"2px solid rgba(255,255,255,0.2)" }}>
          <video ref={localRef} autoPlay playsInline muted
            className="w-full h-full object-cover" />
        </motion.div>
      )}

      {/* Controls */}
      <div className="relative z-10 flex flex-col items-center gap-4 pb-16">

        {/* ✅ Volume slider — shows when speaker button held */}
        <AnimatePresence>
          {showVol && (
            <motion.div
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl"
              style={{ background:"rgba(255,255,255,0.15)", backdropFilter:"blur(10px)" }}>
              <span className="text-white text-xs">🔈</span>
              <input type="range" min="0" max="1" step="0.05"
                value={volume}
                onChange={e => changeVolume(e.target.value)}
                className="w-32 accent-white"
                style={{ cursor:"pointer" }} />
              <span className="text-white text-xs">🔊</span>
              <span className="text-white text-xs font-bold w-8">
                {Math.round(volume * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buttons row */}
        <div className="flex items-center gap-5">
          {/* Mic */}
          <motion.button whileTap={{ scale:0.9 }} onClick={toggleMic}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: micOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            {micOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
          </motion.button>

          {/* End call */}
          <motion.button whileTap={{ scale:0.9 }} onClick={() => endCall(true)}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background:"#ef4444", boxShadow:"0 0 30px rgba(239,68,68,0.5)" }}>
            <PhoneOff className="w-7 h-7 text-white" />
          </motion.button>

          {/* ✅ Speaker / Volume */}
          <motion.button whileTap={{ scale:0.9 }}
            onClick={toggleSpeaker}
            onDoubleClick={() => setShowVol(v => !v)}
            className="w-14 h-14 rounded-full flex items-center justify-center relative"
            style={{ background: speakerOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            <Volume2 className="w-6 h-6 text-white" />
            {/* Volume level indicator dots */}
            {speakerOn && (
              <div className="absolute -bottom-1 flex gap-0.5">
                {[0.33, 0.66, 1.0].map((lvl, i) => (
                  <div key={i} className="w-1 h-1 rounded-full"
                    style={{ background: volume >= lvl ? "white" : "rgba(255,255,255,0.3)" }} />
                ))}
              </div>
            )}
          </motion.button>

          {/* Cam toggle (video calls only) */}
          {callType === "video" && (
            <motion.button whileTap={{ scale:0.9 }} onClick={toggleCam}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: camOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
              {camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
            </motion.button>
          )}
        </div>

        <p className="text-xs" style={{ color:"rgba(255,255,255,0.35)" }}>
          Tap 🔊 to mute · Double tap to adjust volume
        </p>
      </div>

      {/* Call ended overlay */}
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