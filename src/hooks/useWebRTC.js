"use client";
import { useRef, useState } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC(socketRef) {
  const peerRef  = useRef(null);
  const localRef = useRef(null);

  const [remoteStream, setRemoteStream] = useState(null);
  const [callState,    setCallState]    = useState("idle");
  const [callType,     setCallType]     = useState("video");

  /* ── Create a fresh RTCPeerConnection ── */
  function createPeer(targetId) {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    peer.ontrack = (e) => setRemoteStream(e.streams[0]);

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit("call:ice-candidate", {
          to: targetId,
          candidate: e.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
        setCallState("idle");
        setRemoteStream(null);
      }
    };

    return peer;
  }

  /* ── Start outgoing call ── */
  async function startCall(targetId, type = "video") {
    try {
      setCallType(type);
      setCallState("calling");

      localRef.current = await navigator.mediaDevices.getUserMedia({
        video: type === "video",
        audio: true,
      });

      const peer = createPeer(targetId);
      peerRef.current = peer;

      localRef.current
        .getTracks()
        .forEach((t) => peer.addTrack(t, localRef.current));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socketRef.current?.emit("call:offer", { to: targetId, offer, callType: type });
    } catch (err) {
      console.error("startCall error:", err);
      setCallState("idle");
    }
  }

  /* ── Answer incoming call ── */
  async function answerCall(fromId, offer, type) {
    try {
      setCallType(type);
      setCallState("active");

      localRef.current = await navigator.mediaDevices.getUserMedia({
        video: type === "video",
        audio: true,
      });

      const peer = createPeer(fromId);
      peerRef.current = peer;

      localRef.current
        .getTracks()
        .forEach((t) => peer.addTrack(t, localRef.current));

      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socketRef.current?.emit("call:answer", { to: fromId, answer });
    } catch (err) {
      console.error("answerCall error:", err);
      setCallState("idle");
    }
  }

  /* ── Handle answer from remote peer ── */
  async function handleAnswer(answer) {
    try {
      await peerRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      setCallState("active");
    } catch (err) {
      console.error("handleAnswer error:", err);
    }
  }

  /* ── Add ICE candidate ── */
  async function addIceCandidate(candidate) {
    try {
      await peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("addIceCandidate error:", err);
    }
  }

  /* ── End or reject call ── */
  function endCall(targetId) {
    peerRef.current?.close();
    localRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current  = null;
    localRef.current = null;
    setRemoteStream(null);
    setCallState("idle");
    if (targetId) socketRef.current?.emit("call:end", { to: targetId });
  }

  /* ── Toggle microphone ── */
  function toggleMic() {
    localRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
  }

  /* ── Toggle camera ── */
  function toggleCamera() {
    localRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
  }

  return {
    localRef,
    remoteStream,
    callState,
    callType,
    setCallState,
    startCall,
    answerCall,
    handleAnswer,
    addIceCandidate,
    endCall,
    toggleMic,
    toggleCamera,
  };
}