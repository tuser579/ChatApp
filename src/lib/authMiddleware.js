const { NextResponse } = require("next/server");
const { verifyToken }  = require("./jwt.cjs");

function requireAuth(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token  = header.replace("Bearer ", "").trim();
    if (!token) throw new Error("No token");
    const user = verifyToken(token);
    return { user };
  } catch (err) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }
}

module.exports = { requireAuth };