/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
