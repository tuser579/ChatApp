require("dotenv").config({ path: ".env.local" });

const { createServer } = require("http");
const { parse }        = require("url");
const next             = require("next");

const dev    = process.env.NODE_ENV !== "production";
const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // ✅ Allow CORS for Vercel frontend
    res.setHeader("Access-Control-Allow-Origin",  process.env.FRONTEND_URL || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
    handle(req, res, parse(req.url, true));
  });

  const { Server } = require("socket.io");
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin:      process.env.FRONTEND_URL || "*",
      methods:     ["GET", "POST"],
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  global.io = io;
  require("./src/lib/socketHandler.cjs")(io);

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
});