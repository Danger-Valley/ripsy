/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  transpilePackages: ['@rps/core', '@rps/solana-client'],
};

export default nextConfig;

