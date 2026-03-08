/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Next.js 16 uses Turbopack by default — no webpack config needed
  turbopack: {},

  async rewrites() {
    // Only proxy in production (Render backend)
    if (process.env.NODE_ENV !== "production") return [];
    if (!process.env.NEXT_PUBLIC_BACKEND_URL)  return [];

    return [
      {
        source:      "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/:path*`,
      },
      {
        source:      "/socket.io/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL}/socket.io/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;