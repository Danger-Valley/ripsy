/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  transpilePackages: ['@rps/core', '@rps/game-client', '@rps/game-engine'],
};

export default nextConfig;
