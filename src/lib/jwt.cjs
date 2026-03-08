const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };