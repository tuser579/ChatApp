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
      const age     = Date.now() - pending.timestamp;

      if (age < 60000 && !activeCalls.has(userId)) {
        const callAlreadyActive = activeCalls.get(userId) === pending.from ||
                                  activeCalls.get(pending.from) === userId;

        if (!callAlreadyActive) {
          console.log(`📞 Re-delivering pending call to ${userId} (${age}ms late)`);
          setTimeout(() => {
            if (pendingCalls.has(userId) && !activeCalls.has(userId)) {
              socket.emit("call:incoming", {
                from:       pending.from,
                fromName:   pending.fromName,
                fromAvatar: pending.fromAvatar,
                offer:      pending.offer,
                callType:   pending.callType,
              });
            }
          }, 3000);
        }
      } else if (age >= 60000) {
        pendingCalls.delete(userId);
      }
    }

    // ── Online status ──────────────────────────────────────────────────────
    try {
      await mongoConnect();
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      io.emit("user:online", { userId, isOnline: true });
    } catch (e) { console.error("Online error:", e.message); }

    // ── Conversation room ──────────────────────────────────────────────────
    socket.on("join:conversation", (conversationId) => {
      socket.join(conversationId);
      console.log(`📥 ${userId} joined room: ${conversationId}`);
    });

    socket.on("leave:conversation", (conversationId) => {
      socket.leave(conversationId);
      console.log(`📤 ${userId} left room: ${conversationId}`);
    });

    // ── Messages Send ──────────────────────────────────────────────────────
    socket.on("message:send", async ({
      conversationId,
      content,
      type = "text",
      mediaUrl = "",
      fileName = "",
      fileSize = "",
      replyTo = null,
      isForwarded = false,
      forwardFrom = null,
    }) => {
      try {
        await mongoConnect();
        const msg = await Message.create({
          conversation: conversationId,
          sender:       userId,
          content:      content || "",
          type,
          mediaUrl,
          fileName,
          fileSize,
          replyTo:      replyTo || null,
          isForwarded:  Boolean(isForwarded),
          forwardFrom:  forwardFrom || undefined,
          seen:         [userId],
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: msg._id,
          updatedAt:   new Date(),
        });

        const populated = await Message.findById(msg._id)
          .populate("sender", "name avatar")
          .populate({
            path: "replyTo",
            populate: { path: "sender", select: "name avatar" }
          });

        io.to(conversationId).emit("message:new", populated.toObject());

        // Refresh conversation list for all participants
        const updatedConvo = await Conversation.findById(conversationId)
          .populate("participants", "_id name");
        if (updatedConvo) {
          updatedConvo.participants.forEach((p) => {
            const pid = p._id.toString();
            io.to(pid).emit("conversation:update");
          });
        }
      } catch (e) { console.error("❌ message:send:", e.message); }
    });

    // ── Pin / Unpin Message ────────────────────────────────────────────────
    socket.on("message:pin", async ({ messageId, conversationId }) => {
      try {
        await mongoConnect();
        const msg = await Message.findById(messageId).populate("sender", "name avatar");
        if (!msg) return;

        msg.isPinned = true;
        msg.pinnedAt = new Date();
        await msg.save();

        await Conversation.findByIdAndUpdate(conversationId, {
          pinnedMessage: msg._id,
          pinnedBy: userId,
        });

        io.to(conversationId).emit("message:pinned", {
          message: msg.toObject(),
          conversationId,
          pinnedBy: userId,
        });

        io.emit("conversation:update");
      } catch (e) { console.error("❌ message:pin:", e.message); }
    });

    socket.on("message:unpin", async ({ conversationId }) => {
      try {
        await mongoConnect();
        const convo = await Conversation.findById(conversationId);
        if (convo && convo.pinnedMessage) {
          await Message.findByIdAndUpdate(convo.pinnedMessage, { isPinned: false });
        }
        await Conversation.findByIdAndUpdate(conversationId, {
          pinnedMessage: null,
          pinnedBy: null,
        });

        io.to(conversationId).emit("message:unpinned", { conversationId });
        io.emit("conversation:update");
      } catch (e) { console.error("❌ message:unpin:", e.message); }
    });

    // ── Forward Message ────────────────────────────────────────────────────
    socket.on("message:forward", async ({
      originalMessageId,
      targetConversationIds = [],
    }) => {
      try {
        await mongoConnect();
        const origMsg = await Message.findById(originalMessageId).populate("sender", "name");
        if (!origMsg) return;

        const forwardFromName = origMsg.isForwarded && origMsg.forwardFrom?.name
          ? origMsg.forwardFrom.name
          : (origMsg.sender?.name || "User");

        for (const targetId of targetConversationIds) {
          const newMsg = await Message.create({
            conversation: targetId,
            sender:       userId,
            content:      origMsg.content || "",
            type:         origMsg.type || "text",
            mediaUrl:     origMsg.mediaUrl || "",
            fileName:     origMsg.fileName || "",
            fileSize:     origMsg.fileSize || "",
            isForwarded:  true,
            forwardFrom:  { name: forwardFromName, userId: origMsg.sender?._id || origMsg.sender },
            seen:         [userId],
          });

          await Conversation.findByIdAndUpdate(targetId, {
            lastMessage: newMsg._id,
            updatedAt:   new Date(),
          });

          const populated = await Message.findById(newMsg._id)
            .populate("sender", "name avatar");

          io.to(targetId).emit("message:new", populated.toObject());

          const targetConvo = await Conversation.findById(targetId).populate("participants", "_id");
          if (targetConvo) {
            targetConvo.participants.forEach((p) => {
              io.to(p._id.toString()).emit("conversation:update");
            });
          }
        }
      } catch (e) { console.error("❌ message:forward:", e.message); }
    });

    // ── Emoji Reactions ────────────────────────────────────────────────────
    socket.on("message:react", async ({ messageId, conversationId, emoji }) => {
      try {
        await mongoConnect();
        const msg = await Message.findById(messageId);
        if (!msg) return;

        if (!msg.reactions) msg.reactions = [];
        const existingIdx = msg.reactions.findIndex(
          (r) => r.user?.toString() === userId.toString()
        );

        if (existingIdx > -1) {
          if (msg.reactions[existingIdx].emoji === emoji) {
            msg.reactions.splice(existingIdx, 1);
          } else {
            msg.reactions[existingIdx].emoji = emoji;
          }
        } else {
          msg.reactions.push({ user: userId, emoji });
        }

        await msg.save();
        io.to(conversationId).emit("message:reaction_updated", {
          messageId,
          conversationId,
          reactions: msg.reactions,
        });
      } catch (e) { console.error("❌ message:react:", e.message); }
    });

    // ── Edit Message ───────────────────────────────────────────────────────
    socket.on("message:edit", async ({ messageId, conversationId, content }) => {
      try {
        await mongoConnect();
        const msg = await Message.findById(messageId);
        if (!msg || msg.sender.toString() !== userId.toString() || msg.isDeleted) return;

        msg.content = content;
        msg.isEdited = true;
        msg.editedAt = new Date();
        await msg.save();

        io.to(conversationId).emit("message:edited", {
          messageId,
          conversationId,
          content: msg.content,
          isEdited: true,
          editedAt: msg.editedAt,
        });
      } catch (e) { console.error("❌ message:edit:", e.message); }
    });

    // ── Delete Message (Delete for Everyone) ───────────────────────────────
    socket.on("message:delete", async ({ messageId, conversationId }) => {
      try {
        await mongoConnect();
        const msg = await Message.findById(messageId);
        if (!msg || msg.sender.toString() !== userId.toString()) return;

        msg.isDeleted = true;
        msg.content = "";
        msg.mediaUrl = "";
        msg.fileName = "";
        msg.reactions = [];
        await msg.save();

        io.to(conversationId).emit("message:deleted", {
          messageId,
          conversationId,
        });
      } catch (e) { console.error("❌ message:delete:", e.message); }
    });

    // ── Telegram-style Typing & Actions (typing, recording_audio, uploading_file) ──
    socket.on("typing:action", ({ conversationId, action = "typing" }) => {
      socket.to(conversationId).emit("typing:action", { userId, conversationId, action });
    });

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
    socket.on("call:offer", async ({ to, offer, callType }) => {
      try {
        pendingCalls.delete(userId);
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

        pendingCalls.set(to, payload);

        const receiverSockets = userSockets.get(to);
        if (receiverSockets && receiverSockets.size > 0) {
          io.to(to).emit("call:incoming", payload);
        }

        setTimeout(() => {
          if (pendingCalls.has(to) && pendingCalls.get(to).timestamp === payload.timestamp) {
            pendingCalls.delete(to);
          }
        }, 60000);
      } catch (e) { console.error("call:offer error:", e.message); }
    });

    socket.on("call:answer", ({ to, answer }) => {
      pendingCalls.delete(userId);
      pendingCalls.delete(to);
      activeCalls.set(userId, to);
      activeCalls.set(to, userId);
      io.to(to).emit("call:answer", { answer });
    });

    socket.on("call:ready", () => {
      readyUsers.add(userId);
      if (iceBuffer.has(userId)) {
        const candidates = iceBuffer.get(userId);
        candidates.forEach((candidate) => {
          socket.emit("call:ice-candidate", { candidate });
        });
        iceBuffer.delete(userId);
      }
    });

    socket.on("call:ice-candidate", ({ to, candidate }) => {
      if (readyUsers.has(to)) {
        io.to(to).emit("call:ice-candidate", { candidate });
      } else {
        if (!iceBuffer.has(to)) iceBuffer.set(to, []);
        iceBuffer.get(to).push(candidate);
      }
    });

    socket.on("call:end", ({ to }) => {
      pendingCalls.delete(userId);
      pendingCalls.delete(to);
      activeCalls.delete(userId);
      activeCalls.delete(to);
      readyUsers.delete(userId);
      readyUsers.delete(to);
      iceBuffer.delete(userId);
      iceBuffer.delete(to);
      io.to(to).emit("call:ended");
    });

    socket.on("call:reject", ({ to }) => {
      pendingCalls.delete(userId);
      pendingCalls.delete(to);
      io.to(to).emit("call:rejected");
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          readyUsers.delete(userId);
          iceBuffer.delete(userId);

          try {
            await mongoConnect();
            await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
            io.emit("user:online", { userId, isOnline: false, lastSeen: new Date() });
          } catch (e) {}

          const peerId = activeCalls.get(userId);
          if (peerId) {
            io.to(peerId).emit("call:ended");
            activeCalls.delete(userId);
            activeCalls.delete(peerId);
          }
        }
      }
      console.log(`🔴 Disconnected: ${userId} | socket: ${socket.id}`);
    });
  });
};