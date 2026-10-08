/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  transpilePackages: ['@rps/core', '@rps/game-client', '@rps/game-engine'],
  async headers() { return [{ source: '/figures/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }]; },
};

export default nextConfig;
