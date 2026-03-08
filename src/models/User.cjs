const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name:     { type: String,  required: true },
  email:    { type: String,  required: true, unique: true },
  password: { type: String,  required: true },
  avatar:   { type: String,  default: "" },
  status:   { type: String,  default: "Hey there!" },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date,    default: Date.now },
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);