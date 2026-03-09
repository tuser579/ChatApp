/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // In production on Vercel — proxy all /api and /socket.io to Render
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
      || "https://nexchat-backend-az2d.onrender.com";

    if (process.env.NODE_ENV !== "production") return [];

    return {
      beforeFiles: [
        {
          source:      "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
        {
          source:      "/socket.io/:path*",
          destination: `${backendUrl}/socket.io/:path*`,
        },
      ]
    };
  },
};

module.exports = nextConfig;