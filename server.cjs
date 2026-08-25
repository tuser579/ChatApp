// Only load .env.local in local development
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: ".env.local" });
}

const { createServer } = require("http");
const { parse }        = require("url");
const next             = require("next");

const dev    = process.env.NODE_ENV !== "production";
const app    = next({ dev });
const handle = app.getRequestHandler();

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || "*";

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
    handle(req, res, parse(req.url, true));
  });

  const { Server } = require("socket.io");
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin:      ALLOWED_ORIGIN,
      methods:     ["GET", "POST"],
      credentials: ALLOWED_ORIGIN !== "*",
    },
    pingTimeout:  60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8, // 100MB buffer for media streams
  });

  global.io = io;
  require("./src/lib/socketHandler.cjs")(io);

  const PORT = process.env.PORT || 3000;
  const server = httpServer.listen(PORT, () => {
    console.log(`✅ [Production Server] Running on port ${PORT} (dev: ${dev})`);
  });

  // Graceful shutdown handling for Render / Railway / Docker
  const handleShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, gracefully shutting down...`);
    io.close(() => {
      server.close(() => {
        console.log("👋 Closed all active connections. Exiting process.");
        process.exit(0);
      });
    });
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT",  () => handleShutdown("SIGINT"));
});