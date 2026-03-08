const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isGroup:      { type: Boolean, default: false },
  groupName:    { type: String,  default: "" },
  groupAvatar:  { type: String,  default: "" },
  lastMessage:  { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
}, { timestamps: true });

module.exports = mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);