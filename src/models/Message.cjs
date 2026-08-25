const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: "User",         required: true, index: true },
  content:      { type: String,  default: "" },
  type:         { type: String,  default: "text", enum: ["text", "image", "audio", "file", "sticker"] },
  mediaUrl:     { type: String,  default: "" },
  fileName:     { type: String,  default: "" },
  fileSize:     { type: String,  default: "" },
  seen:         [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
  replyTo:      { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  reactions:    [{
    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    emoji: { type: String, required: true },
  }],
  isEdited:     { type: Boolean, default: false },
  isDeleted:    { type: Boolean, default: false },
  editedAt:     { type: Date },
  isPinned:     { type: Boolean, default: false, index: true },
  pinnedAt:     { type: Date },
  isForwarded:  { type: Boolean, default: false },
  forwardFrom:  {
    name:   { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
}, { timestamps: true });

// Compound indexes for high-speed queries in production
MessageSchema.index({ conversation: 1, createdAt: 1 });
MessageSchema.index({ conversation: 1, isPinned: 1 });
MessageSchema.index({ conversation: 1, isDeleted: 1 });

module.exports = mongoose.models.Message || mongoose.model("Message", MessageSchema);