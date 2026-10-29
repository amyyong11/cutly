import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@huggingface/transformers";

// transformers.js caches downloaded models inside its own node_modules folder
// by default. Serverless hosts like Vercel mount the app read-only, so the
// first download fails with ENOENT; /tmp is the only writable location there.
if (process.env.VERCEL) {
  env.cacheDir = path.join(tmpdir(), "transformers-cache");
}
