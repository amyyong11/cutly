import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Lets the client route large images through Vercel Blob only when a
    // Blob store is connected (see src/lib/transfer.ts).
    NEXT_PUBLIC_BLOB_UPLOADS: process.env.BLOB_READ_WRITE_TOKEN ? "1" : "",
  },
  // The "local" provider loads its model files at runtime by path, so the
  // build's file tracing doesn't pick them up on its own.
  outputFileTracingIncludes: {
    "/api/remove-background": [
      "./node_modules/@imgly/background-removal-node/dist/**/*",
    ],
  },
  serverExternalPackages: [
    "sharp",
    "@imgly/background-removal-node",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
};

export default nextConfig;
