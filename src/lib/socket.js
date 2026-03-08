let socket        = null;
let connecting    = null;
let currentUserId = null;

// ✅ Hardcoded Render URL as fallback
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  || "https://nexchat-backend-az2d.onrender.com";

export async function connectSocket(userId) {
  if (socket && socket.connected && currentUserId === userId) return socket;
  if (connecting) return connecting;
  if (socket && currentUserId !== userId) { socket.disconnect(); socket = null; }

  currentUserId = userId;
  console.log("🔌 Connecting socket to:", BACKEND_URL);

  connecting = new Promise(async (resolve) => {
    const { io } = await import("socket.io-client");

    socket = io(BACKEND_URL, {
      path:                 "/socket.io",
      auth:                 { userId },
      transports:           ["websocket", "polling"],
      reconnection:         true,
      reconnectionAttempts: 999,
      reconnectionDelay:    500,
      reconnectionDelayMax: 2000,
      timeout:              15000,
      closeOnBeforeunload:  false,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id, "→", BACKEND_URL);
      connecting = null;
      resolve(socket);
    });

    socket.on("disconnect",    reason  => console.warn("🔌 Disconnected:", reason));
    socket.on("reconnect",     attempt => console.log("🔄 Reconnected after", attempt, "attempts"));
    socket.on("connect_error", err     => {
      console.error("❌ Socket error:", err.message, "→ URL:", BACKEND_URL);
      connecting = null;
      resolve(socket);
    });
  });

  return connecting;
}

export function getSocket()        { return socket; }
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket        = null;
    connecting    = null;
    currentUserId = null;
  }
}