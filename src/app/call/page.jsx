"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, VolumeX, Loader2, AlertCircle } from "lucide-react";
import { connectSocket, getSocket } from "@/lib/socket";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "https://nexchat-backend-az2d.onrender.com";

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
  let ctx = null;
  let timer = null;
  function ring() {
    if (stopped) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      [[480, 0, 0.4],[400, 0.5, 0.4]].forEach(([freq, delay, dur]) => {
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
      { urls: "turn:openrelay.metered.ca:80",                username:"openrelayproject", credential:"openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443",               username:"openrelayproject", credential:"openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username:"openrelayproject", credential:"openrelayproject" },
    ];
  }
}

function CallScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const toUserId     = searchParams.get("userId");
  const fromUserId   = searchParams.get("from");
  const callType     = searchParams.get("type") || "voice";
  const isCaller     = !!toUserId;

  const localRef    = useRef(null);
  const remoteRef   = useRef(null);
  const peerRef     = useRef(null);
  const localStream = useRef(null);
  const pendingICE  = useRef([]);
  const remoteReady = useRef(false);
  const stopRing    = useRef(null);

  const [callState,    setCallState]    = useState("init");
  const [remoteStream, setRemoteStream] = useState(null); // ✅ FIX: track in state
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(callType === "video");
  const [speakerOn,    setSpeakerOn]    = useState(true);
  const [volume,       setVolume]       = useState(1.0);
  const [showVol,      setShowVol]      = useState(false);
  const [duration,     setDuration]     = useState(0);
  const [permError,    setPermError]    = useState("");
  const [otherName,    setOtherName]    = useState("");
  const [mounted,      setMounted]      = useState(false);
  const [me,           setMe]           = useState({});
  const [netStatus,    setNetStatus]    = useState("");
  const [facingMode,   setFacingMode]   = useState("user");

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    const t = localStorage.getItem("token") || "";
    if (!t) { router.push("/login"); return; }
    setMe(u); setMounted(true);
  }, []);

  useEffect(() => {
    if (callState !== "active") return;
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    const id = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  // ✅ FIX: Attach remoteStream to the audio/video element via useEffect
  // This guarantees the DOM element is mounted before we set srcObject
  useEffect(() => {
    const el = remoteRef.current;
    if (!el || !remoteStream) return;

    console.log("🎵 Attaching remoteStream to element, tracks:", remoteStream.getTracks().map(t => t.kind + ":" + t.readyState));
    el.srcObject = remoteStream;
    el.muted  = false;
    el.volume = volume;

    const tryPlay = () => {
      el.play().then(() => {
        console.log("▶️ Remote audio playing!");
      }).catch(err => {
        console.warn("⚠️ Autoplay blocked:", err.message);
        // ✅ Retry on next user interaction (browser autoplay policy)
        const unlock = () => {
          el.play().catch(() => {});
          document.removeEventListener("click",      unlock);
          document.removeEventListener("touchstart", unlock);
        };
        document.addEventListener("click",      unlock, { once: true });
        document.addEventListener("touchstart", unlock, { once: true });
      });
    };

    tryPlay();
  }, [remoteStream]); // ✅ Re-runs whenever remoteStream changes

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
          await peer.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.warn("ICE:", e.message));
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

    socket.on("call:end",      () => endCall(false));
    socket.on("call:rejected", () => { setCallState("rejected"); setTimeout(() => router.back(), 2000); });

    if (isCaller) await runCaller(socket);
    else          await runReceiver(socket);
  }

  async function runCaller(socket) {
    setCallState("requesting");
    const stream = await getMedia();
    if (!stream) return;

    const iceServers = await getIceServers();
    const peer = buildPeer(toUserId, socket, iceServers);

    // ✅ Add tracks BEFORE createOffer
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

  // ✅ New: Switch camera for mobile
  async function switchCamera() {
    if (callType !== "video" || !localStream.current) return;
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);

    // Stop old tracks
    localStream.current.getVideoTracks().forEach(t => t.stop());

    const constraints = {
      audio: true,
      video: { facingMode: nextMode, width: { ideal:1280 }, height: { ideal:720 } }
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      // Update local storage ref
      const oldTracks = localStream.current.getTracks();
      localStream.current = new MediaStream([newVideoTrack, ...oldTracks.filter(t => t.kind === "audio")]);

      if (localRef.current) localRef.current.srcObject = localStream.current;

      // Replace track in peer connection
      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newVideoTrack);
      }
    } catch (e) {
      console.error("Camera switch error:", e);
    }
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

    const iceServers = await getIceServers();
    const peer = buildPeer(from, socket, iceServers);

    // ✅ Add tracks BEFORE setRemoteDescription
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
    // ✅ FIX: Don't set "active" here — wait for ontrack / ICE connected
    setCallState("calling");
  }

  async function getMedia() {
    const constraints = callType === "video"
      ? { audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video: { facingMode, width:{ideal:1280}, height:{ideal:720} } }
      : { audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video: false };
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
      setPermError(msg); setCallState("error");
      return null;
    }
  }

  function buildPeer(targetId, socket, iceServers) {
    console.log("🔧 Building RTCPeerConnection with", iceServers.length, "ICE servers");
    const peer = new RTCPeerConnection({ iceServers });
    peerRef.current = peer;

    // ✅ FIX: ontrack — update React state so useEffect attaches srcObject reliably
    peer.ontrack = (e) => {
      console.log("🎵 ontrack:", e.track.kind, "streams:", e.streams.length, "readyState:", e.track.readyState);

      if (e.streams && e.streams[0]) {
        // ✅ Store in state — useEffect will attach to DOM element
        setRemoteStream(e.streams[0]);
      } else {
        // ✅ Fallback: build a MediaStream manually
        setRemoteStream(prev => {
          if (prev && prev instanceof MediaStream) {
            // Clone and add track to existing stream
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
      // ✅ FIX: Only surface real problem states — hide normal "checking" state
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
            const sock = getSocket();
            sock?.emit("call:offer", { to: toUserId, offer, callType });
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

  function endCall(notify = true) {
    if (notify) {
      const target = toUserId || fromUserId;
      const s = getSocket();
      if (target && s) s.emit("call:end", { to: target });
    }
    cleanup();
    setCallState("ended");
    setTimeout(() => router.back(), 2000);
  }

  function cleanup() {
    if (stopRing.current) { stopRing.current(); stopRing.current = null; }
    peerRef.current?.close(); peerRef.current = null;
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    // ✅ Clear remote audio element
    if (remoteRef.current) {
      remoteRef.current.srcObject = null;
    }
    setRemoteStream(null);
    const s = getSocket();
    if (s) { s.off("call:answer"); s.off("call:ice-candidate"); s.off("call:end"); s.off("call:rejected"); }
  }

  function toggleMic()    { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicOn(m => !m); }
  function toggleCam()    { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOn(c => !c); }
  function toggleSpeaker() {
    const next = !speakerOn;
    if (remoteRef.current) { remoteRef.current.muted = !next; remoteRef.current.volume = next ? volume : 0; }
    setSpeakerOn(next);
  }
  function changeVolume(val) {
    const v = parseFloat(val); setVolume(v);
    if (remoteRef.current) { remoteRef.current.volume = v; remoteRef.current.muted = v === 0; }
    setSpeakerOn(v > 0);
  }

  if (callState === "error") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <AlertCircle className="w-16 h-16 text-red-400" />
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-white mb-3">Permission Required</h2>
        <p className="text-sm" style={{ color:"rgba(255,255,255,0.6)" }}>{permError}</p>
      </div>
      <button onClick={() => router.back()} className="px-6 py-3 rounded-xl text-white text-sm font-semibold"
        style={{ background:"rgba(255,255,255,0.1)" }}>Go Back</button>
    </div>
  );

  if (callState === "init" || callState === "requesting") return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)" }}>
      <Loader2 className="w-10 h-10 spin" style={{ color:"#6366f1" }} />
      <p className="text-white font-semibold">
        {callState === "init" ? "Connecting..." : "Requesting microphone..."}
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
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between"
      style={{ background:"linear-gradient(135deg,#0f172a,#0a0e1a)", zIndex:100 }}>

      {/* ✅ FIX: Always render BOTH audio and video elements so remoteRef is always mounted.
          For voice calls: video is hidden. For video calls: audio is hidden (video carries audio too). */}
      <audio
        ref={callType === "voice" ? remoteRef : undefined}
        autoPlay
        playsInline
        style={{ display: "none" }}
      />
      {callType === "video" && (
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex:1 }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex:2,
        background:"linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 60%,rgba(0,0,0,0.8) 100%)" }} />

      {/* Top */}
      <div className="relative flex flex-col items-center pt-16 gap-4" style={{ zIndex:3 }}>
        <Avatar name={otherName || "User"} size={100} />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">
            {otherName || (isCaller ? "Calling..." : "Connected")}
          </h2>
          <p className="text-sm" style={{ color:"rgba(255,255,255,0.5)" }}>
            {callState === "calling" ? "🔔 Ringing..."
           : callState === "active"  ? fmt(duration)
           : "Connecting..."}
          </p>
          {netStatus && netStatus !== "" && (
            <p className="text-xs mt-1 px-3 py-1 rounded-full inline-block"
              style={{ background:"rgba(239,68,68,0.15)", color:"rgba(255,180,180,0.9)" }}>
              ⚠️ {netStatus}
            </p>
          )}
        </div>
      </div>

      {callType === "video" && (
        <div className="absolute top-20 right-4 rounded-2xl overflow-hidden"
          style={{ width:110, height:150, border:"2px solid rgba(255,255,255,0.2)", zIndex:10 }}>
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
      )}

      {/* Controls */}
      <div className="relative flex flex-col items-center gap-4 pb-16" style={{ zIndex:3 }}>
        <AnimatePresence>
          {showVol && (
            <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl"
              style={{ background:"rgba(255,255,255,0.15)", backdropFilter:"blur(10px)" }}>
              <span className="text-white text-xs">🔈</span>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={e => changeVolume(e.target.value)}
                style={{ accentColor:"white", cursor:"pointer", width:"128px" }} />
              <span className="text-white text-xs">🔊</span>
              <span className="text-white text-xs font-bold" style={{ width:"32px" }}>
                {Math.round(volume * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-5">
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

          <motion.button whileTap={{ scale:0.9 }}
            onClick={toggleSpeaker} onDoubleClick={() => setShowVol(v => !v)}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: speakerOn ? "rgba(255,255,255,0.15)" : "#ef4444" }}>
            {speakerOn ? <Volume2 className="w-6 h-6 text-white" /> : <VolumeX className="w-6 h-6 text-white" />}
          </motion.button>

          {callType === "video" && (
            <motion.button whileTap={{ scale:0.9 }} onClick={switchCamera}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <motion.div animate={{ rotate: facingMode === "user" ? 0 : 180 }}>
                <Video className="w-6 h-6 text-white" />
              </motion.div>
            </motion.button>
          )}

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