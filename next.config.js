/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Disable Turbopack for build — use webpack (stable for production)
  experimental: {},

  async rewrites() {
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
};

module.exports = nextConfig;