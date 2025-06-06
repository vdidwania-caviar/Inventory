import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: [
      'http://localhost:9002',
      'https://9000-firebase-studio-1748902614898.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev',
      'https://9003-firebase-studio-1748902614898.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev',
      'https://6000-firebase-studio-1748902614898.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev',
      // add others as needed
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;