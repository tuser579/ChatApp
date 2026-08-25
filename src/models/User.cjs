const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name:     { type: String,  required: true, index: true },
  email:    { type: String,  required: true, unique: true, index: true, lowercase: true, trim: true },
  password: { type: String,  required: true },
  avatar:   { type: String,  default: "" },
  status:   { type: String,  default: "Hey there! I am using Telegram Web." },
  isOnline: { type: Boolean, default: false, index: true },
  lastSeen: { type: Date,    default: Date.now },
}, { timestamps: true });

UserSchema.index({ name: "text", email: "text" });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);