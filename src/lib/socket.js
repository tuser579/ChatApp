// src/lib/socket.js
// Single persistent socket — never disconnects on page navigation

let socket     = null;
let connecting = null;
let currentUserId = null;

export async function connectSocket(userId) {
  // Already connected for same user
  if (socket && socket.connected && currentUserId === userId) {
    return socket;
  }

  // Already connecting
  if (connecting) {
    return connecting;
  }

  // Disconnect old socket if different user
  if (socket && currentUserId !== userId) {
    socket.disconnect();
    socket = null;
  }

  currentUserId = userId;

  connecting = new Promise(async (resolve) => {
    const { io } = await import("socket.io-client");

    socket = io("http://localhost:3000", {
      path:                 "/socket.io",
      auth:                 { userId },
      transports:           ["websocket", "polling"],
      reconnection:         true,
      reconnectionAttempts: 999,   // keep trying forever
      reconnectionDelay:    500,
      reconnectionDelayMax: 2000,
      timeout:              10000,
      // ✅ Prevent socket from disconnecting when tab loses focus
      closeOnBeforeunload:  false,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id, "| userId:", userId);
      connecting = null;
      resolve(socket);
    });

    socket.on("disconnect", (reason) => {
      console.warn("🔌 Socket disconnected:", reason);
      // Do NOT set socket = null here
      // Socket.io will auto-reconnect
    });

    socket.on("reconnect", (attempt) => {
      console.log("🔄 Socket reconnected after", attempt, "attempts");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket error:", err.message);
      connecting = null;
      resolve(socket); // resolve anyway
    });
  });

  return connecting;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket         = null;
    connecting     = null;
    currentUserId  = null;
  }
}