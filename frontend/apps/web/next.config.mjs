import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  transpilePackages: ['@rps/core', '@rps/solana-client'],
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../../'),
};

export default nextConfig;

