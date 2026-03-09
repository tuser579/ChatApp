const Message      = require("../models/Message.cjs");
const Conversation = require("../models/Conversation.cjs");
const User         = require("../models/User.cjs");
const { mongoConnect } = require("./mongoConnect.cjs");

const userSockets = new Map(); // userId → Set of socketIds
const pendingCalls = new Map(); // receiverId → callPayload
const activeCalls  = new Map(); // userId → peerId (to track active calls for auto-cleanup)

module.exports = function socketHandler(io) {
  io.on("connection", async (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return;

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    socket.join(userId);
    console.log(`🟢 Connected: ${userId} | socket: ${socket.id}`);

    // ✅ Re-deliver pending call on reconnect — with longer delay
    // so client listeners have time to register
    if (pendingCalls.has(userId)) {
      const pending = pendingCalls.get(userId);
      const age = Date.now() - pending.timestamp;
      if (age < 60000) { // 60 seconds window
        console.log(`📞 Re-delivering pending call to ${userId} (${age}ms late)`);
        setTimeout(() => {
          socket.emit("call:incoming", {
            from:     pending.from,
            fromName: pending.fromName,
            offer:    pending.offer,
            callType: pending.callType,
          });
          console.log(`   ✅ Re-delivered to new socket: ${socket.id}`);
        }, 3000); // ✅ 3s — gives desktop browsers time to register listeners
      } else {
        pendingCalls.delete(userId);
        console.log(`⏰ Pending call expired for ${userId}`);
      }
    }

    try {
      await mongoConnect();
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit("user:online", { userId });
    } catch (e) { console.error("Online error:", e.message); }

    socket.on("join:conversation", (conversationId) => {
      socket.join(conversationId);
      console.log(`📥 ${userId} joined room: ${conversationId}`);
    });

    socket.on("message:send", async ({ conversationId, content, type = "text", mediaUrl = "", fileName = "" }) => {
      try {
        await mongoConnect();
        const msg = await Message.create({
          conversation: conversationId,
          sender: userId,
          content: content || "",
          type, mediaUrl, fileName,
        });
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: msg._id, updatedAt: new Date(),
        });
        const populated = await msg.populate("sender", "name avatar");
        io.to(conversationId).emit("message:new", populated.toObject());

        // ✅ Emits event to refresh conversations list for all participants
        const updatedConvo = await Conversation.findById(conversationId).populate("participants", "id");
        if (updatedConvo) {
          updatedConvo.participants.forEach(p => {
            io.to(p._id.toString()).emit("conversation:update");
          });
        }
      } catch (e) { console.error("❌ message:send:", e.message); }
    });

    socket.on("typing:start", ({ conversationId }) =>
      socket.to(conversationId).emit("typing:start", { userId, conversationId }));

    socket.on("typing:stop", ({ conversationId }) =>
      socket.to(conversationId).emit("typing:stop", { userId, conversationId }));

    socket.on("message:seen", async ({ messageId, conversationId }) => {
      try {
        await mongoConnect();
        await Message.findByIdAndUpdate(messageId, { $addToSet: { seen: userId } });
        io.to(conversationId).emit("message:seen", { messageId, userId });
      } catch (e) {}
    });

    // ── CALLS ──
    socket.on("call:offer", async ({ to, offer, callType }) => {
      try {
        await mongoConnect();
        const caller = await User.findById(userId).select("name");
        const callerName = caller?.name || "Unknown";

        const payload = {
          from:      userId,
          fromName:  callerName,
          offer,
          callType,
          timestamp: Date.now(),
        };

        console.log(`📞 call:offer: ${userId}(${callerName}) → ${to} | ${callType}`);

        // ✅ Always store pending — don't delete it quickly
        pendingCalls.set(to, payload);

        const receiverSockets = userSockets.get(to);
        console.log(`   Receiver sockets:`, receiverSockets ? Array.from(receiverSockets) : "NONE");

        if (receiverSockets && receiverSockets.size > 0) {
          // Emit to all receiver sockets
          io.to(to).emit("call:incoming", payload);
          console.log(`   ✅ Sent call:incoming to ${to}`);
        } else {
          console.log(`   ⏳ Receiver offline — stored as pending`);
        }

        // ✅ Keep pending for 60 seconds — not 3 seconds
        setTimeout(() => {
          if (pendingCalls.has(to) &&
              pendingCalls.get(to).timestamp === payload.timestamp) {
            pendingCalls.delete(to);
            console.log(`   🗑️ Pending call for ${to} expired after 60s`);
          }
        }, 60000);

      } catch (e) {
        console.error("call:offer error:", e.message);
      }
    });

    socket.on("call:answer", ({ to, answer }) => {
      console.log(`✅ call:answer: ${userId} → ${to}`);
      pendingCalls.delete(userId); // answered — clear pending
      
      // ✅ Track active call for auto-cleanup on disconnect
      activeCalls.set(userId, to);
      activeCalls.set(to, userId);
      
      io.to(to).emit("call:answer", { answer });
    });

    socket.on("call:ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("call:ice-candidate", { candidate });
    });

    socket.on("call:end", ({ to }) => {
      console.log(`📵 call:end: ${userId} → ${to}`);
      pendingCalls.delete(to);
      activeCalls.delete(userId);
      activeCalls.delete(to);
      io.to(to).emit("call:end");
    });

    socket.on("call:reject", ({ to }) => {
      console.log(`🚫 call:reject: ${userId} → ${to}`);
      pendingCalls.delete(userId);
      activeCalls.delete(userId);
      activeCalls.delete(to);
      io.to(to).emit("call:rejected");
    });

    socket.on("disconnect", async () => {
      const socketSet = userSockets.get(userId);
      socketSet?.delete(socket.id);
      if (socketSet?.size === 0) userSockets.delete(userId);

      console.log(`🔴 Disconnected: ${userId} | socket: ${socket.id}`);

      // ✅ FIX: Auto-end active call if user disconnects abruptly
      if (activeCalls.has(userId)) {
        const peerId = activeCalls.get(userId);
        console.log(`⚠️ Abrupt disconnect during call: ${userId} | ending for peer: ${peerId}`);
        io.to(peerId).emit("call:end");
        activeCalls.delete(userId);
        activeCalls.delete(peerId);
      }

      if (!userSockets.has(userId)) {
        try {
          await mongoConnect();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
          io.emit("user:offline", { userId, lastSeen: new Date() });
        } catch (e) {}
      }
    });
  });
};
