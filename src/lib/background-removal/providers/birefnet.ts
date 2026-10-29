import "@/lib/transformers-env";
import { AutoModel, AutoProcessor, RawImage, PreTrainedModel, Processor } from "@huggingface/transformers";
import sharp from "sharp";
import { closeAlphaGaps } from "../alpha-refine";
import { decontaminateEdges } from "../foreground-estimate";
import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from "../types";

const MODEL_ID = "onnx-community/BiRefNet_lite";

// Loaded once per server process and reused across requests — session
// creation for this model takes tens of seconds, so it must not happen
// per-request.
let modelPromise: Promise<PreTrainedModel> | null = null;
let processorPromise: Promise<Processor> | null = null;

function getModel(): Promise<PreTrainedModel> {
  if (!modelPromise) {
    modelPromise = AutoModel.from_pretrained(MODEL_ID, { dtype: "fp32" });
  }
  return modelPromise;
}

function getProcessor(): Promise<Processor> {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_ID);
  }
  return processorPromise;
}

export class BiRefNetProvider implements BackgroundRemovalProvider {
  name = "birefnet";

  async removeBackground(
    input: BackgroundRemovalInput
  ): Promise<BackgroundRemovalResult> {
    const [model, processor] = await Promise.all([getModel(), getProcessor()]);

    const source = new Blob([new Uint8Array(input.imageBuffer)], {
      type: input.mimeType,
    });
    const image = await RawImage.fromBlob(source);

    const { pixel_values } = await processor(image);
    const { output_image } = await model({ input_image: pixel_values });
    const mask = await RawImage.fromTensor(
      output_image[0].sigmoid().mul(255).to("uint8")
    ).resize(image.width, image.height);

    const { data, info } = await sharp(input.imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    for (let i = 0; i < pixelCount; i++) {
      data[i * 4 + 3] = mask.data[i];
    }

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
