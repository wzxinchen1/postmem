/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'prisma'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: /node_modules/,
      }
    }
    return config
  },
}

export default nextConfig
