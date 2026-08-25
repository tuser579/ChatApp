const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: "User",         required: true },
  content:      { type: String,  default: "" },
  type:         { type: String,  default: "text", enum: ["text","image","audio","file"] },
  mediaUrl:     { type: String,  default: "" },
  fileName:     { type: String,  default: "" },
  seen:         [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replyTo:      { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  reactions:    [{
    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    emoji: { type: String, required: true },
  }],
  isEdited:     { type: Boolean, default: false },
  isDeleted:    { type: Boolean, default: false },
  editedAt:     { type: Date },
}, { timestamps: true });

module.exports = mongoose.models.Message || mongoose.model("Message", MessageSchema);