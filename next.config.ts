import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["three"],
  generateBuildId: () => packageJson.version,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // @mujoco/mujoco WASM bindings contain conditional Node.js code
    // that imports "module" and "worker_threads" — exclude from client bundle
    if (!isServer) {
      config.externals.push("module", "worker_threads");
    }
    return config;
  },
};

export default nextConfig;
