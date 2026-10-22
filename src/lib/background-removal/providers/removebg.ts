import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "../types";

export class RemoveBgProvider implements BackgroundRemovalProvider {
  name = "removebg";

  async removeBackground(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    const apiKey = process.env.REMOVEBG_API_KEY;
    if (!apiKey) {
      throw new Error("REMOVEBG_API_KEY is not configured");
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(input.imageBuffer)], {
      type: input.mimeType,
    });
    formData.append("image_file", blob, "image");
    formData.append("size", "auto");
    formData.append("format", "png");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`remove.bg API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      imageBuffer: Buffer.from(arrayBuffer),
      mimeType: "image/png",
    };
  }
}
