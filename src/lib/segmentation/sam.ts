import { randomUUID } from "node:crypto";
import "@/lib/transformers-env";
import {
  AutoProcessor,
  RawImage,
  Sam2Model,
  Tensor,
} from "@huggingface/transformers";
import sharp from "sharp";

// Point-prompted segmentation for the editor's smart select: the user taps a
// spot and SAM returns the mask of the object part under it. Encoding the
// image is the slow step (~1s), so it runs once per editing session and the
// embeddings are cached; each tap afterwards only runs the light mask decoder
// (~50-100ms).

const MODEL_ID = "onnx-community/sam2.1-hiera-tiny-ONNX";
const MAX_SESSIONS = 6;

export interface SegmentPoint {
  x: number;
  y: number;
  /** 1 = part of the selection, 0 = exclude from it. */
  label: 0 | 1;
}

// The SAM processors' point helpers aren't in the generic Processor typings.
interface SamProcessor {
  (image: RawImage): Promise<{
    pixel_values: Tensor;
    original_sizes: [number, number][];
    reshaped_input_sizes: [number, number][];
  }>;
  image_processor: {
    reshape_input_points(
      points: number[][][][],
      originalSizes: [number, number][],
      reshapedInputSizes: [number, number][]
    ): Tensor;
    add_input_labels(labels: number[][][], points: Tensor): Tensor;
  };
  post_process_masks(
    masks: Tensor,
    originalSizes: [number, number][],
    reshapedInputSizes: [number, number][],
    options: { binarize: boolean }
  ): Promise<Tensor[]>;
}

interface Session {
  embeddings: Record<string, Tensor>;
  originalSizes: [number, number][];
  reshapedInputSizes: [number, number][];
}

let modelPromise: Promise<Sam2Model> | null = null;
let processorPromise: Promise<SamProcessor> | null = null;
const sessions = new Map<string, Session>();

function getModel(): Promise<Sam2Model> {
  if (!modelPromise) {
    modelPromise = Sam2Model.from_pretrained(MODEL_ID, {
      dtype: "fp32",
    }) as Promise<Sam2Model>;
  }
  return modelPromise;
}

function getProcessor(): Promise<SamProcessor> {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(
      MODEL_ID
    ) as unknown as Promise<SamProcessor>;
  }
  return processorPromise;
}

export async function createSession(imageBuffer: Buffer): Promise<string> {
  const [model, processor] = await Promise.all([getModel(), getProcessor()]);

  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = new RawImage(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    3
  );

  const inputs = await processor(image);
  const embeddings = await model.get_image_embeddings(inputs);

  const id = randomUUID();
  sessions.set(id, {
    embeddings,
    originalSizes: inputs.original_sizes,
    reshapedInputSizes: inputs.reshaped_input_sizes,
  });
  // Map iteration order is insertion order, so the first key is the oldest.
  while (sessions.size > MAX_SESSIONS) {
    sessions.delete(sessions.keys().next().value!);
  }
  return id;
}

/**
 * Returns a soft grayscale PNG mask (255 = selected) at the original image's
 * resolution, or null if the session has expired.
 */
export async function segmentAt(
  sessionId: string,
  points: SegmentPoint[]
): Promise<Buffer | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;
  // Refresh recency for LRU eviction.
  sessions.delete(sessionId);
  sessions.set(sessionId, session);

  const [model, processor] = await Promise.all([getModel(), getProcessor()]);
  const imageProcessor = processor.image_processor;

  const inputPoints = imageProcessor.reshape_input_points(
    [[points.map((p) => [p.x, p.y])]],
    session.originalSizes,
    session.reshapedInputSizes
  );
  const inputLabels = imageProcessor.add_input_labels(
    [[points.map((p) => p.label)]],
    inputPoints
  );

  const output = await model({
    ...session.embeddings,
    input_points: inputPoints,
    input_labels: inputLabels,
  });

  const [masks] = await processor.post_process_masks(
    output.pred_masks,
    session.originalSizes,
    session.reshapedInputSizes,
    { binarize: false }
  );

  // SAM proposes three masks at different granularities (sub-part, part,
  // whole object); take the one it is most confident in.
  const scores = Array.from(output.iou_scores.data as Float32Array);
  const best = scores.indexOf(Math.max(...scores));
  const [, , height, width] = masks.dims as number[];
  const logits = (masks.data as Float32Array).subarray(
    best * width * height,
    (best + 1) * width * height
  );

  // The upscaled logits ramp smoothly across object boundaries; a sigmoid
  // turns that ramp into a slightly feathered edge instead of a jagged one.
  const mask = Buffer.alloc(width * height);
  for (let i = 0; i < logits.length; i++) {
    mask[i] = Math.round(255 / (1 + Math.exp(-logits[i] * 4)));
  }

  return sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}
