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

  // The API routes read these with fs at request time. Next only traces static
  // imports into a serverless bundle, so without this every data route returns
  // ENOENT on Vercel while working perfectly in dev.
  outputFileTracingIncludes: {
    "/api/courses": ["./data/course-structures.json", "./data/qut-active-courses.json"],
    "/api/courses/[code]": ["./data/course-structures.json"],
    "/api/unit-prereqs": ["./data/unit-prereqs.json"],
    "/api/units/[code]": ["./data/unit-meta.json"],
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
