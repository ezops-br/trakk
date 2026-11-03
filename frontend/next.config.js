const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const api = (process.env.INTERNAL_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '')
    return [{ source: '/api/v1/:path*', destination: `${api}/:path*` }]
  },
}

module.exports = (phase) => ({
  ...nextConfig,
  // Agent build checks must not overwrite the member's running dev server.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
})
