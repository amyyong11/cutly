import { removeBackground } from "@imgly/background-removal-node";
import ndarray from "ndarray";
import sharp from "sharp";
import { closeAlphaGaps } from "../alpha-refine";
import { decontaminateEdges } from "../foreground-estimate";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "../types";

// libvips' operation cache keeps decoded images around between requests;
// on a memory-capped serverless function that headroom matters more.
sharp.cache(false);

export class LocalProvider implements BackgroundRemovalProvider {
  name = "local";

  async removeBackground(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    const { data, info } = await sharp(input.imageBuffer)
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Handing imgly the decoded pixels (and asking for raw output) skips a
    // full-resolution PNG encode and decode; it writes the alpha mask into
    // `data` in place.
    await removeBackground(ndarray(data, [info.height, info.width, 4]), {
      output: { format: "image/x-rgba8" },
    });

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
