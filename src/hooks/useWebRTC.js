// PATH: src/hooks/useWebRTC.js
"use client";

import { useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

export function useWebRTC(socketRef) {
  const peerRef      = useRef(null);  // RTCPeerConnection
  const localRef     = useRef(null);  // local MediaStream
  const pendingIce   = useRef([]);    // ICE candidates buffered before remoteDesc is set
  const targetIdRef  = useRef(null);  // who we are currently in a call with

  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callState,    setCallState]    = useState("idle"); // idle | calling | incoming | active
  const [callType,     setCallType]     = useState("video");
  const [isMuted,      setIsMuted]      = useState(false);
  const [isCameraOff,  setIsCameraOff]  = useState(false);

  // ── Full cleanup ────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    // Stop all local tracks
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.ontrack              = null;
      peerRef.current.onicecandidate       = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    pendingIce.current  = [];
    targetIdRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  // ── Get microphone + camera ─────────────────────────────────────────────
  const getUserMedia = useCallback(async (type) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Create RTCPeerConnection ────────────────────────────────────────────
  const createPeer = useCallback((targetId) => {
    // Close any existing peer first
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);

    // Remote track received → set remote stream
    peer.ontrack = ({ streams }) => {
      if (streams?.[0]) {
        setRemoteStream(streams[0]);
      }
    };

    // Send ICE candidates to peer via socket
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current?.emit("call:ice-candidate", {
          to: targetId,
          candidate,
        });
      }
    };

    // Auto-cleanup if connection drops
    peer.onconnectionstatechange = () => {
      console.log("🔗 Connection state:", peer.connectionState);
      if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
        cleanup();
      }
    };

    // Log ICE gathering state for debugging
    peer.onicegatheringstatechange = () => {
      console.log("🧊 ICE gathering:", peer.iceGatheringState);
    };

    peerRef.current = peer;
    return peer;
  }, [socketRef, cleanup]);

  // ── STEP 1: Start outgoing call (caller) ────────────────────────────────
  const startCall = useCallback(async (targetId, type = "video") => {
    if (callState !== "idle") return;
    try {
      targetIdRef.current = targetId;
      setCallType(type);
      setCallState("calling");

      const stream = await getUserMedia(type);
      const peer   = createPeer(targetId);

      // Add local tracks to peer connection
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));

      // Create offer and send to callee via socket
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socketRef.current?.emit("call:offer", { to: targetId, offer, callType: type });
      console.log(`📞 Offer sent to ${targetId}`);

    } catch (err) {
      console.error("startCall error:", err);
      cleanup();
    }
  }, [callState, getUserMedia, createPeer, socketRef, cleanup]);

  // ── STEP 2: Answer incoming call (callee) ───────────────────────────────
  const answerCall = useCallback(async (fromId, offer, type) => {
    try {
      targetIdRef.current = fromId;
      setCallType(type);
      setCallState("active");

      const stream = await getUserMedia(type);
      const peer   = createPeer(fromId);

      // Add local tracks
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));

      // Set remote description from caller's offer
      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any ICE candidates that arrived before remoteDescription was set
      for (const c of pendingIce.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
      }
      pendingIce.current = [];

      // Create answer and send back to caller
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socketRef.current?.emit("call:answer",  { to: fromId, answer });
      socketRef.current?.emit("call:ready");   // signal: ready to receive ICE
      console.log(`✅ Answer sent to ${fromId}`);

    } catch (err) {
      console.error("answerCall error:", err);
      cleanup();
    }
  }, [getUserMedia, createPeer, socketRef, cleanup]);

  // ── STEP 3: Handle answer from callee (caller side) ─────────────────────
  const handleAnswer = useCallback(async (answer) => {
    if (!peerRef.current) return;
    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));

      // Flush buffered ICE candidates
      for (const c of pendingIce.current) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
      }
      pendingIce.current = [];

      // Signal: ready to receive ICE
      socketRef.current?.emit("call:ready");
      setCallState("active");
      console.log("✅ Remote description set — call active");

    } catch (err) {
      console.error("handleAnswer error:", err);
    }
  }, [socketRef]);

  // ── STEP 4: Add ICE candidate (with buffering) ──────────────────────────
  const addIceCandidate = useCallback(async (candidate) => {
    if (!candidate) return;
    try {
      if (peerRef.current?.remoteDescription) {
        // Remote desc already set → add immediately
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Remote desc not yet set → buffer it
        console.log("🧊 Buffering ICE candidate");
        pendingIce.current.push(candidate);
      }
    } catch (err) {
      console.error("addIceCandidate error:", err);
    }
  }, []);

  // ── End call (both sides) ────────────────────────────────────────────────
  const endCall = useCallback((targetId) => {
    const target = targetId || targetIdRef.current;
    if (target) {
      socketRef.current?.emit("call:end", { to: target });
    }
    cleanup();
    console.log("📵 Call ended");
  }, [socketRef, cleanup]);

  // ── Reject incoming call ─────────────────────────────────────────────────
  const rejectCall = useCallback((fromId) => {
    socketRef.current?.emit("call:reject", { to: fromId });
    cleanup();
    console.log("🚫 Call rejected");
  }, [socketRef, cleanup]);

  // ── Cancel outgoing call before answer ───────────────────────────────────
  const cancelCall = useCallback((targetId) => {
    const target = targetId || targetIdRef.current;
    if (target) {
      socketRef.current?.emit("call:cancel", { to: target });
    }
    cleanup();
    console.log("❌ Call cancelled");
  }, [socketRef, cleanup]);

  // ── Toggle microphone ────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  // ── Toggle camera ────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
    }
  }, []);

  return {
    // Streams
    localRef,
    localStream,
    remoteStream,

    // Call state
    callState,
    callType,
    isMuted,
    isCameraOff,

    // State setter (for incoming call UI)
    setCallState,
    setCallType,

    // Actions
    startCall,
    answerCall,
    handleAnswer,
    addIceCandidate,
    endCall,
    rejectCall,
    cancelCall,
    toggleMic,
    toggleCamera,
    cleanup,
  };
}