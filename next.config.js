/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: /.*/,
      }
    }
    return config
  },
}

export default nextConfig
