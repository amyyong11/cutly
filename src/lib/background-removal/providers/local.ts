import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";
import { closeAlphaGaps } from "../alpha-refine";
import { decontaminateEdges } from "../foreground-estimate";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "../types";

export class LocalProvider implements BackgroundRemovalProvider {
  name = "local";

  async removeBackground(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    const source = new Blob([new Uint8Array(input.imageBuffer)], {
      type: input.mimeType,
    });
    const blob = await removeBackground(source);
    const arrayBuffer = await blob.arrayBuffer();

    const image = sharp(Buffer.from(arrayBuffer)).ensureAlpha();
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Radius scaled to resolution and capped: enough to fill small matting
    // dropouts on thin subject parts (fingers, jewelry) without fusing gaps
    // between separate parts (e.g. the space between two fingers).
    const radius = Math.min(
      5,
      Math.max(2, Math.round(Math.min(info.width, info.height) / 400))
    );
    closeAlphaGaps(data, info.width, info.height, radius);
    decontaminateEdges(data, info.width, info.height);

    const imageBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    return {
      imageBuffer,
      mimeType: "image/png",
    };
  }
}
