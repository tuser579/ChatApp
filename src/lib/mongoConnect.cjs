const mongoose = require("mongoose");

let cached = global.mongoose || (global.mongoose = { conn: null, promise: null });

async function mongoConnect() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.warn("⚠️ MONGODB_URI environment variable is missing (build/offline mode).");
    return null;
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log("🍃 MongoDB Connected Successfully");
      return mongooseInstance;
    }).catch((err) => {
      console.error("❌ MongoDB connection error:", err.message);
      cached.promise = null;
      return null;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    return null;
  }

  return cached.conn;
}

module.exports = { mongoConnect };