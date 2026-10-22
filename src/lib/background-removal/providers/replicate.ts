import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "../types";

const REPLICATE_VERSION =
  "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

export class ReplicateProvider implements BackgroundRemovalProvider {
  name = "replicate";

  async removeBackground(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error("REPLICATE_API_TOKEN is not configured");
    }

    const base64 = input.imageBuffer.toString("base64");
    const dataUri = `data:${input.mimeType};base64,${base64}`;

    const createResponse = await fetch(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait=60",
        },
        body: JSON.stringify({
          version: REPLICATE_VERSION,
          input: {
            image: dataUri,
            format: "png",
            background_type: "rgba",
            threshold: 0,
          },
        }),
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Replicate API error: ${createResponse.status}`);
    }

    let prediction = await createResponse.json();

    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: { Authorization: `Bearer ${apiToken}` },
        }
      );
      prediction = await pollResponse.json();
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Replicate prediction failed: ${prediction.status}`);
    }

    const outputUrl = prediction.output;
    if (!outputUrl) {
      throw new Error("Replicate returned no output");
    }

    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to download processed image");
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    return {
      imageBuffer: Buffer.from(arrayBuffer),
      mimeType: "image/png",
    };
  }
}
