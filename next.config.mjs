/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["placeholder.svg"],
    unoptimized: true,
  },

  trailingSlash: false,
  compress: true,

  // Both were on for years and hid ~17 type errors. Typecheck is at zero now, so a
  // broken type fails the build instead of shipping silently.

  // The API routes read these with fs at request time. Next only traces static
  // imports into a serverless bundle, so without this every data route returns
  // ENOENT on Vercel while working perfectly in dev.
  //
  // It has to sit under `experimental` on Next 14.2: the top-level key is only
  // recognised from Next 15, and here it is silently dropped (the build warns
  // "Unrecognized key" and traces nothing).
  experimental: {
    outputFileTracingIncludes: {
      "/api/courses": ["./data/course-structures.json", "./data/qut-active-courses.json"],
      "/api/courses/[code]": ["./data/course-structures.json"],
      "/api/unit-prereqs": ["./data/unit-prereqs.json"],
      "/api/unit-classes": ["./data/qut-unit-classes.json"],
      "/api/units/[code]": ["./data/unit-meta.json"],
    },
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
