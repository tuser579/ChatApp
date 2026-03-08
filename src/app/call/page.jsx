"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Volume2, VolumeX, Loader2, AlertCircle
} from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

// ✅ Free TURN servers — fixes NAT/firewall audio issues
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
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
    {
      urls:       "turn:openrelay.metered.ca:443?transport=tcp",
      username:   "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls:       "turn:standard.relay.metered.ca:80",
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

function createRingTone() {
  let stopped = false;
  let ctx     = null;
  let timer   = null;

  function ring() {
    if (stopped) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      [[480, 0, 0.4], [400, 0.5, 0.4]].forEach(([freq, delay, dur]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.3,   ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime  + delay + dur);
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

function CallScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const toUserId   = searchParams.get("userId");
  const fromUserId = searchParams.get("from");
  const callType   = searchParams.get("type") || "voice";
  const isCaller   = !!toUserId;

  const localRef    = useRef(null);
  const remoteRef   = useRef(null);
  const peerRef     = useRef(null);
  const localStream = useRef(null);
  const pendingICE  = useRef([]);
  const remoteReady = useRef(false);
  const stopRing    = useRef(null);

  const [callState, setCallState] = useState("init");
  const [micOn,     setMicOn]     = useState(true);
  const [camOn,     setCamOn]     = useState(callType === "video");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [volume,    setVolume]    = useState(1.0);
  const [showVol,   setShowVol]   = useState(false);
  const [duration,  setDuration]  = useState(0);
  const [permError, setPermError] = useState("");
  const [otherName, setOtherName] = useState("");
  const [mounted,   setMounted]   = useState(false);
  const [me,        setMe]        = useState({});
  const [iceState,  setIceState]  = useState("");

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (callState !== "active") return;
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    const id = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    if (!mounted) return;
    initCall();
    return () => cleanup();
  }, [mounted]);

  async function initCall() {
    const myId   = me?.id || me?._id;
    const socket = await connectSocket(myId);

    socket.off("call:answer");
    socket.off("call:ice-candidate");
    socket.off("call:end");
    socket.off("call:rejected");

    socket.on("call:answer", async ({ answer }) => {
      try {
        console.log("📩 Got answer, setting remote description");
        const peer = peerRef.current;
        if (!peer) return;
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        remoteReady.current = true;
        console.log("✅ Remote description set, adding", pendingICE.current.length, "pending ICE");
        for (const c of pendingICE.current) {
          await peer.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.warn("ICE add error:", e));
        }
        pendingICE.current = [];
      } catch (e) { console.error("Answer error:", e); }
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      try {
        const peer = peerRef.current;
        if (!peer) return;
        if (remoteReady.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingICE.current.push(candidate);
        }
      } catch (e) { console.warn("ICE error:", e); }
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

    const peer = buildPeer(toUserId, socket);

    // ✅ Add tracks BEFORE creating offer
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
      console.log("➕ Caller added track:", track.kind, track.label);
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

  async function runReceiver(socket) {
    setCallState("requesting");

    const raw = sessionStorage.getItem("incomingCall");
    if (!raw) { console.error("No incoming call data"); router.back(); return; }

    const { offer, from, fromName } = JSON.parse(raw);
    sessionStorage.removeItem("incomingCall");
    setOtherName(fromName || from);
    console.log("📱 Receiver: got offer from:", from);

    const stream = await getMedia();
    if (!stream) return;

    const peer = buildPeer(from, socket);

    // ✅ Add tracks BEFORE setting remote description
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
      console.log("➕ Receiver added track:", track.kind, track.label);
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
    console.log("📤 Answer sent to:", from);
    setCallState("active");
  }

  async function getMedia() {
    // ✅ Audio only for voice calls — no video constraints
    const constraints = callType === "video"
      ? {
          audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true },
          video: { width:{ ideal:1280 }, height:{ ideal:720 }, facingMode:"user" },
        }
      : {
          audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true },
          video: false,
        };

    try {
      console.log("🎤 Requesting media:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;

      console.log("✅ Got stream tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}`));

      if (localRef.current && callType === "video") {
        localRef.current.srcObject = stream;
        localRef.current.muted     = true; // ✅ mute local to prevent echo
      }
      return stream;
    } catch (err) {
      console.error("❌ getUserMedia error:", err.name, err.message);
      let msg = "Could not access microphone.";
      if (err.name === "NotAllowedError")  msg = "Microphone permission denied. Please allow access and try again.";
      if (err.name === "NotFoundError")    msg = "No microphone found on this device.";
      if (err.name === "NotReadableError") msg = "Microphone is already in use by another app.";
      setPermError(msg);
      setCallState("error");
      return null;
    }
  }

  function buildPeer(targetId, socket) {
    console.log("🔧 Building peer for:", targetId);
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    // ✅ ontrack — receive remote audio/video
    peer.ontrack = (e) => {
      console.log("🎵 ontrack fired! kind:", e.track.kind, "streams:", e.streams.length);

      if (remoteRef.current) {
        if (e.streams && e.streams[0]) {
          // ✅ Use the stream directly
          remoteRef.current.srcObject = e.streams[0];
        } else {
          // ✅ Fallback: build stream from track
          if (!remoteRef.current.srcObject) {
            remoteRef.current.srcObject = new MediaStream();
          }
          remoteRef.current.srcObject.addTrack(e.track);
        }

        remoteRef.current.muted  = false;
        remoteRef.current.volume = volume;

        remoteRef.current.play().then(() => {
          console.log("▶️ Remote audio/video playing!");
          setCallState("active");
        }).catch(err => {
          console.warn("⚠️ Autoplay blocked:", err.message);
          // ✅ Try again on user interaction
          document.addEventListener("click", () => {
            remoteRef.current?.play().catch(() => {});
          }, { once: true });
          setCallState("active");
        });
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        console.log("🧊 Sending ICE candidate");
        socket.emit("call:ice-candidate", { to: targetId, candidate: e.candidate });
      } else {
        console.log("🧊 ICE gathering complete");
      }
    };

    peer.oniceconnectionstatechange = () => {
      const s = peer.iceConnectionState;
      console.log("🔗 ICE connection state:", s);
      setIceState(s);
      if (s === "connected" || s === "completed") setCallState("active");
      if (s === "failed")        { console.error("❌ ICE failed — no audio path"); }
      if (s === "disconnected")  endCall(false);
    };

    peer.onconnectionstatechange = () => {
      console.log("🔗 Peer connection state:", peer.connectionState);
      if (peer.connectionState === "connected")                              setCallState("active");
      if (["failed","closed"].includes(peer.connectionState))               endCall(false);
    };

    peer.onsignalingstatechange = () => {
      console.log("📡 Signaling state:", peer.signalingState);
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
    peerRef.current = null;
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
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

  function toggleSpeaker() {
    const next = !speakerOn;
    if (remoteRef.current) {
      remoteRef.current.muted  = !next;
      remoteRef.current.volume = next ? volume : 0;
    }
    setSpeakerOn(next);
  }

  function changeVolume(val) {
    const v = parseFloat(val);
    setVolume(v);
    if (remoteRef.current) {
      remoteRef.current.volume = v;
      remoteRef.current.muted  = v === 0;
    }
    setSpeakerOn(v > 0);
  }

  // ── Error ──
  if (callState === "error") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background:"rgba(239,68,68,0.15)" }}>
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-white mb-3">Permission Required</h2>
        <p className="text-sm" style={{ color:"rgba(255,255,255,0.6)" }}>{permError}</p>
        <p className="text-xs mt-2" style={{ color:"rgba(255,255,255,0.35)" }}>
          Click 🔒 in address bar → allow microphone
        </p>
      </div>
      <button onClick={() => router.back()}
        className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background:"rgba(255,255,255,0.1)" }}>
        Go Back
      </button>
    </div>
  );

  // ── Loading ──
  if (callState === "init" || callState === "requesting") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <Loader2 className="w-10 h-10 spin" style={{ color:"#6366f1" }} />
      <p className="text-white font-semibold">
        {callState === "init" ? "Connecting..." : "Requesting microphone..."}
      </p>
    </div>
  );

  // ── Rejected ──
  if (callState === "rejected") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500">
        <PhoneOff className="w-7 h-7 text-white" />
      </div>
      <p className="text-white font-bold text-xl">Call Declined</p>
    </div>
  );

  // ── Active Call UI ──
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)", zIndex:100 }}>

      {/* ✅ Remote audio element — always present, never muted */}
      {callType === "video"
        ? <video ref={remoteRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex:1 }} />
        : <audio ref={remoteRef} autoPlay playsInline
            style={{ display:"none" }} />
      }

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex:2,
        background:"linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.8) 100%)" }} />

      {/* Top info */}
      <div className="relative flex flex-col items-center pt-16 gap-4" style={{ zIndex:3 }}>
        <Avatar name={otherName || "User"} size={100} />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">
            {otherName || (isCaller ? "Calling..." : "Connected")}
          </h2>
          <p className="text-sm mb-1" style={{ color:"rgba(255,255,255,0.5)" }}>
            {callState === "calling" ? "🔔 Ringing..."
           : callState === "active"  ? fmt(duration)
           : "Connecting..."}
          </p>
          {/* ICE state debug */}
          {iceState && iceState !== "connected" && iceState !== "completed" && (
            <p className="text-xs" style={{ color:"rgba(255,255,255,0.3)" }}>
              Network: {iceState}
            </p>
          )}
        </div>
      </div>

      {/* Local video (video calls only) */}
      {callType === "video" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          className="absolute top-20 right-4 rounded-2xl overflow-hidden"
          style={{ width:110, height:150, border:"2px solid rgba(255,255,255,0.2)", zIndex:10 }}>
          <video ref={localRef} autoPlay playsInline muted
            className="w-full h-full object-cover" />
        </motion.div>
      )}

      {/* Controls */}
      <div className="relative flex flex-col items-center gap-4 pb-16" style={{ zIndex:3 }}>

        {/* Volume slider */}
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
                className="w-32"
                style={{ accentColor:"white", cursor:"pointer" }} />
              <span className="text-white text-xs">🔊</span>
              <span className="text-white text-xs font-bold w-8">
                {Math.round(volume * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buttons */}
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

          {/* Speaker */}
          <motion.button whileTap={{ scale:0.9 }}
            onClick={toggleSpeaker}
            onDoubleClick={() => setShowVol(v => !v)}
            className="w-14 h-14 rounded-full flex items-center justify-center relative"
            style={{ background: speakerOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            {speakerOn
              ? <Volume2 className="w-6 h-6 text-white" />
              : <VolumeX  className="w-6 h-6 text-white" />}
          </motion.button>

          {/* Cam (video only) */}
          {callType === "video" && (
            <motion.button whileTap={{ scale:0.9 }} onClick={toggleCam}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: camOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
              {camOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
            </motion.button>
          )}
        </div>

        <p className="text-xs" style={{ color:"rgba(255,255,255,0.3)" }}>
          Tap 🔊 to mute · Double tap for volume
        </p>
      </div>

      {/* Ended overlay */}
      <AnimatePresence>
        {callState === "ended" && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background:"rgba(0,0,0,0.85)", zIndex:50 }}>
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