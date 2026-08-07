/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["placeholder.svg"],
    unoptimized: true,
  },

  trailingSlash: false,
  compress: true,

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ]
  },

  async redirects() {
    return [
      {
        source: "/health",
        destination: "/api/health",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
