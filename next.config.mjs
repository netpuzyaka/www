/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    outputFileTracingIncludes: {
      "/api/info": ["./node_modules/youtube-dl-exec/bin/*"],
      "/api/download": ["./node_modules/youtube-dl-exec/bin/*"],
    },
  },
};

export default nextConfig;
