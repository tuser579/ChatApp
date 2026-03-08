"use client";
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

let globalSocket = null;

export function useSocket(userId) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    if (!globalSocket) {
      globalSocket = io({ path: "/api/socket", auth: { userId } });
    }
    socketRef.current = globalSocket;

    return () => {};
  }, [userId]);

  return socketRef;
}