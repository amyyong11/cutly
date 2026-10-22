import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "./types";

export type { BackgroundRemovalInput, BackgroundRemovalResult, BackgroundRemovalProvider };

// Providers are imported lazily so only the selected one is loaded. This
// matters beyond startup time: "local" pulls in its own older native copy of
// onnxruntime-node, and loading it alongside the version used by "birefnet"
// and smart select makes the server abort (the two native bindings free
// each other's sessions).
const providers: Record<string, () => Promise<BackgroundRemovalProvider>> = {
  birefnet: async () => new (await import("./providers/birefnet")).BiRefNetProvider(),
  local: async () => new (await import("./providers/local")).LocalProvider(),
  removebg: async () => new (await import("./providers/removebg")).RemoveBgProvider(),
  replicate: async () => new (await import("./providers/replicate")).ReplicateProvider(),
};

export async function getProvider(): Promise<BackgroundRemovalProvider> {
  const providerName = process.env.BACKGROUND_REMOVAL_PROVIDER || "birefnet";
  const factory = providers[providerName];
  if (!factory) {
    throw new Error(`Unknown background removal provider: ${providerName}`);
  }
  return factory();
}

export async function removeBackground(
  input: BackgroundRemovalInput
): Promise<BackgroundRemovalResult> {
  const provider = await getProvider();
  return provider.removeBackground(input);
}
