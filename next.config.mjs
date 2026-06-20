/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
