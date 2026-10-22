import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "sharp",
    "@imgly/background-removal-node",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
};

export default nextConfig;
