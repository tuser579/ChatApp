const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema({
  participants:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
  isGroup:        { type: Boolean, default: false, index: true },
  groupName:      { type: String,  default: "" },
  groupAvatar:    { type: String,  default: "" },
  groupAdmin:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isSavedMessages:{ type: Boolean, default: false, index: true },
  lastMessage:    { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  pinnedMessage:  { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  pinnedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  pinnedUsers:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

// Compound indexes for lightning-fast sidebar loading
ConversationSchema.index({ participants: 1, updatedAt: -1 });
ConversationSchema.index({ participants: 1, isSavedMessages: 1 });

module.exports = mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);