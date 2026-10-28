/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  compress: true,
  // Keep the unused optimizer and its API disabled after the framework security upgrade.
  // GHSA-2xp9-vwfh-vxw4: untrusted AVIF decoding must not reach the server-side sharp pipeline.
  images: { unoptimized: true },
  // compiler.removeConsole is NOT supported by Turbopack (dev mode)
  // Only apply in production builds where Turbopack isn't used
  ...(process.env.NODE_ENV === 'production' && process.env.npm_lifecycle_event !== 'dev'
    ? { compiler: { removeConsole: true } }
    : {}),
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  eslint: {
    dirs: ['app', 'pages', 'components', 'lib', 'src', 'types'],
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Aggressive caching for static assets
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/api/buildings',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' }],
      },
      {
        source: '/api/devices/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        // Authenticated workspace snapshots own their private/no-store policy.
        source: '/api/services/:path((?!(?:apps/workspace|workspace)(?:/|$)).*)?',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        source: '/api/racks/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        source: '/api/locations/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      // Dashboard API caching — reduce load on integrations
      // VMware responses are authenticated and control their own cache policy.
      // Inventory freshness is handled by the source-scoped server cache.
      {
        source: '/api/integrations/fortigate',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        source: '/api/integrations/nms/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/api/security/quarantine',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        source: '/api/alarms',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=15, stale-while-revalidate=60' }],
      },
      {
        source: '/api/dashboard/summary',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
    ];
  },
  experimental: {
    // Optimize package imports to reduce bundle size
    optimizePackageImports: [
      'lucide-react', 
      '@radix-ui/react-icons',
      'recharts',
      'date-fns',
      // Avoid walking unrelated loaders and effects when compiling the room scene.
      '@react-three/drei',
      'three-stdlib',
    ],
    // Enable SWC transformations for faster compilation
    swcTraceProfiling: false,
  },
};

module.exports = nextConfig;
