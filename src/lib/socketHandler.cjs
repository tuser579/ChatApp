// PATH: src/lib/socketHandler.cjs

const Message      = require("../models/Message.cjs");
const Conversation = require("../models/Conversation.cjs");
const User         = require("../models/User.cjs");
const { mongoConnect } = require("./mongoConnect.cjs");

const userSockets  = new Map(); // userId → Set of socketIds
const pendingCalls = new Map(); // receiverId → callPayload
const activeCalls  = new Map(); // userId → peerId
const iceBuffer    = new Map(); // userId → Array of buffered ICE candidates
const readyUsers   = new Set(); // userId → is user on call page and ready?

module.exports = function socketHandler(io) {
  io.on("connection", async (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return;

    // ── Track sockets ──────────────────────────────────────────────────────
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.join(userId);
    console.log(`🟢 Connected: ${userId} | socket: ${socket.id}`);

    // ── Re-deliver pending call on reconnect ───────────────────────────────
    if (pendingCalls.has(userId)) {
      const pending = pendingCalls.get(userId);
      const age = Date.now() - pending.timestamp;
      if (age < 60000) {
        console.log(`📞 Re-delivering pending call to ${userId} (${age}ms late)`);
        setTimeout(() => {
          socket.emit("call:incoming", {
            from:       pending.from,
            fromName:   pending.fromName,
            fromAvatar: pending.fromAvatar,
            offer:      pending.offer,
            callType:   pending.callType,
          });
          console.log(`   ✅ Re-delivered to socket: ${socket.id}`);
        }, 3000);
      } else {
        pendingCalls.delete(userId);
        console.log(`⏰ Pending call expired for ${userId}`);
      }
    }

    // ── Online status ──────────────────────────────────────────────────────
    try {
      await mongoConnect();
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit("user:online", { userId });
    } catch (e) { console.error("Online error:", e.message); }

    // ── Conversation room ──────────────────────────────────────────────────
    socket.on("join:conversation", (conversationId) => {
      socket.join(conversationId);
      console.log(`📥 ${userId} joined room: ${conversationId}`);
    });

    // ── Messages ───────────────────────────────────────────────────────────
    socket.on("message:send", async ({
      conversationId, content, type = "text", mediaUrl = "", fileName = ""
    }) => {
      try {
        await mongoConnect();
        const msg = await Message.create({
          conversation: conversationId,
          sender:       userId,
          content:      content || "",
          type, mediaUrl, fileName,
        });
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: msg._id,
          updatedAt:   new Date(),
        });
        const populated = await msg.populate("sender", "name avatar");
        io.to(conversationId).emit("message:new", populated.toObject());

        // Refresh conversation list for all participants
        const updatedConvo = await Conversation.findById(conversationId)
          .populate("participants", "id");
        if (updatedConvo) {
          updatedConvo.participants.forEach((p) => {
            io.to(p._id.toString()).emit("conversation:update");
          });
        }
      } catch (e) { console.error("❌ message:send:", e.message); }
    });

    // ── Typing ─────────────────────────────────────────────────────────────
    socket.on("typing:start", ({ conversationId }) =>
      socket.to(conversationId).emit("typing:start", { userId, conversationId }));

    socket.on("typing:stop", ({ conversationId }) =>
      socket.to(conversationId).emit("typing:stop", { userId, conversationId }));

    // ── Seen ───────────────────────────────────────────────────────────────
    socket.on("message:seen", async ({ messageId, conversationId }) => {
      try {
        await mongoConnect();
        await Message.findByIdAndUpdate(messageId, { $addToSet: { seen: userId } });
        io.to(conversationId).emit("message:seen", { messageId, userId });
      } catch (e) { console.error("message:seen:", e.message); }
    });

    // ════════════════════════════════════════════════════════════════════════
    // WEBRTC CALLS
    // ════════════════════════════════════════════════════════════════════════

    // ── Step 1: Caller sends offer ─────────────────────────────────────────
    // Client emits: { to: string, offer: RTCSessionDescription, callType: "audio"|"video" }
    socket.on("call:offer", async ({ to, offer, callType }) => {
      try {
        await mongoConnect();
        const caller       = await User.findById(userId).select("name avatar");
        const callerName   = caller?.name   || "Unknown";
        const callerAvatar = caller?.avatar || "";

        const payload = {
          from:       userId,
          fromName:   callerName,
          fromAvatar: callerAvatar,
          offer,
          callType,
          timestamp:  Date.now(),
        };

        console.log(`📞 call:offer: ${userId}(${callerName}) → ${to} | ${callType}`);

        // Store as pending for reconnect handling
        pendingCalls.set(to, payload);

        const receiverSockets = userSockets.get(to);
        if (receiverSockets && receiverSockets.size > 0) {
          io.to(to).emit("call:incoming", payload);
          console.log(`   ✅ Sent call:incoming to ${to}`);
        } else {
          console.log(`   ⏳ Receiver offline — stored as pending`);
        }

        // Auto-expire pending after 60s
        setTimeout(() => {
          if (pendingCalls.has(to) &&
              pendingCalls.get(to).timestamp === payload.timestamp) {
            pendingCalls.delete(to);
            console.log(`   🗑️ Pending call for ${to} expired after 60s`);
          }
        }, 60000);

      } catch (e) { console.error("call:offer error:", e.message); }
    });

    // ── Step 2: Callee sends answer ────────────────────────────────────────
    // Client emits: { to: string, answer: RTCSessionDescription }
    socket.on("call:answer", ({ to, answer }) => {
      console.log(`✅ call:answer: ${userId} → ${to}`);
      pendingCalls.delete(userId);

      // Track active call for auto-cleanup on disconnect
      activeCalls.set(userId, to);
      activeCalls.set(to, userId);

      io.to(to).emit("call:answer", { answer });
    });

    // ── Step 3: Signal peer connection is ready to receive ICE ────────────
    // Client emits: (no payload)
    socket.on("call:ready", () => {
      console.log(`🔔 call:ready: ${userId}`);
      readyUsers.add(userId);

      // Flush any buffered ICE candidates
      if (iceBuffer.has(userId)) {
        const candidates = iceBuffer.get(userId);
        console.log(`   🧊 Flushing ${candidates.length} ICE candidates to ${userId}`);
        candidates.forEach((candidate) => {
          socket.emit("call:ice-candidate", { candidate });
        });
        iceBuffer.delete(userId);
      }
    });

    // ── Step 4: ICE candidate exchange (both directions) ──────────────────
    // Client emits: { to: string, candidate: RTCIceCandidate }
    socket.on("call:ice-candidate", ({ to, candidate }) => {
      if (readyUsers.has(to)) {
        io.to(to).emit("call:ice-candidate", { candidate });
      } else {
        // Buffer until the peer signals ready
        console.log(`   🧊 Buffering ICE candidate for ${to}`);
        if (!iceBuffer.has(to)) iceBuffer.set(to, []);
        iceBuffer.get(to).push(candidate);
      }
    });

    // ── End call (graceful hang up) ────────────────────────────────────────
    // Client emits: { to: string }
    socket.on("call:end", ({ to }) => {
      console.log(`📵 call:end: ${userId} → ${to}`);
      _cleanupCall(userId, to);
      io.to(to).emit("call:end");
    });

    // ── Reject incoming call ───────────────────────────────────────────────
    // Client emits: { to: string }
    socket.on("call:reject", ({ to }) => {
      console.log(`🚫 call:reject: ${userId} → ${to}`);
      pendingCalls.delete(userId);
      _cleanupCall(userId, to);
      io.to(to).emit("call:rejected");
    });

    // ── Caller cancelled before callee answered ────────────────────────────
    // Client emits: { to: string }
    socket.on("call:cancel", ({ to }) => {
      console.log(`❌ call:cancel: ${userId} → ${to}`);
      pendingCalls.delete(to);
      _cleanupCall(userId, to);
      io.to(to).emit("call:cancelled");
    });

    // ── Callee is busy (already in a call) ────────────────────────────────
    // Client emits: { to: string }
    socket.on("call:busy", ({ to }) => {
      console.log(`📵 call:busy: ${userId} → ${to}`);
      pendingCalls.delete(userId);
      io.to(to).emit("call:busy");
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      const socketSet = userSockets.get(userId);
      socketSet?.delete(socket.id);
      if (socketSet?.size === 0) userSockets.delete(userId);

      console.log(`🔴 Disconnected: ${userId} | socket: ${socket.id}`);

      // Auto-end active call if user disconnects abruptly
      if (activeCalls.has(userId)) {
        const peerId = activeCalls.get(userId);
        console.log(`⚠️ Abrupt disconnect during call — ending for peer: ${peerId}`);
        io.to(peerId).emit("call:end");
        _cleanupCall(userId, peerId);
      }

      readyUsers.delete(userId);
      iceBuffer.delete(userId);

      // Mark offline only when ALL sockets for this user are gone
      if (!userSockets.has(userId)) {
        try {
          await mongoConnect();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
          io.emit("user:offline", { userId, lastSeen: new Date() });
        } catch (e) { console.error("Offline error:", e.message); }
      }
    });
  });
};

// ── Helper: clean up all call state for two peers ─────────────────────────
function _cleanupCall(userA, userB) {
  activeCalls.delete(userA);
  activeCalls.delete(userB);
  readyUsers.delete(userA);
  readyUsers.delete(userB);
  iceBuffer.delete(userA);
  iceBuffer.delete(userB);
}