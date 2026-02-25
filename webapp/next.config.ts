import type { NextConfig } from "next";

// Must run before Next.js dev overlay; fixes "localStorage.getItem is not a function" (Node v25 broken --localstorage-file)
import "./src/lib/polyfill-localstorage";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
