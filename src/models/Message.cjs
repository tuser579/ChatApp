const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: "User",         required: true },
  content:      { type: String,  default: "" },
  type:         { type: String,  default: "text", enum: ["text","image","audio","file"] },
  mediaUrl:     { type: String,  default: "" },
  fileName:     { type: String,  default: "" },
  seen:         [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

module.exports = mongoose.models.Message || mongoose.model("Message", MessageSchema);