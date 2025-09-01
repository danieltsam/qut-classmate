/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Optimize for production
  experimental: {
    outputFileTracingRoot: undefined,
  },
  
  // Image optimization settings
  images: {
    domains: ['placeholder.svg'],
    unoptimized: true, // Disable Next.js image optimization for simpler deployment
  },
  
  // Build settings
  eslint: {
    ignoreDuringBuilds: true, // For learning - focus on deployment not linting
  },
  typescript: {
    ignoreBuildErrors: true, // For learning - focus on deployment not type errors
  },
  
  // Disable static optimization for better container performance
  trailingSlash: false,
  
  // Enable compression
  compress: true,
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ]
  },
  
  // Redirect configuration
  async redirects() {
    return [
      {
        source: '/health',
        destination: '/api/health',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
