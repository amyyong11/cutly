import { loadImage } from "./image-utils";

export type Background =
  | { type: "transparent" }
  | { type: "color"; color: string }
  | { type: "blur" }
  | { type: "image"; url: string };

export type ExportFormat = "png" | "jpg";

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

function drawBlurred(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  const radius = Math.max(4, Math.round(Math.max(width, height) * 0.015));

  if (typeof ctx.filter === "string") {
    // Overdraw past the edges so the blur doesn't fade into transparency
    // at the canvas border.
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(img, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);
    ctx.restore();
    return;
  }

  // Fallback for browsers without canvas filters: downscale in steps, then
  // scale back up with smoothing, which approximates a gaussian blur.
  let source: CanvasImageSource = img;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  const targetW = Math.max(8, Math.round(width / radius));
  while (sw / 2 > targetW) {
    const step = document.createElement("canvas");
    step.width = Math.round(sw / 2);
    step.height = Math.round(sh / 2);
    const stepCtx = step.getContext("2d")!;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(source, 0, 0, step.width, step.height);
    source = step;
    sw = step.width;
    sh = step.height;
  }
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();
}

/**
 * Draws the cutout over the chosen background. `maxDimension` downsizes the
 * output for fast on-screen previews; omit it for full-resolution exports.
 */
export async function composite(
  cutoutUrl: string,
  originalUrl: string,
  background: Background,
  options: { maxDimension?: number; fallbackFill?: string } = {}
): Promise<HTMLCanvasElement> {
  const cutout = await loadImage(cutoutUrl);
  const scale = options.maxDimension
    ? Math.min(1, options.maxDimension / Math.max(cutout.naturalWidth, cutout.naturalHeight))
    : 1;
  const width = Math.round(cutout.naturalWidth * scale);
  const height = Math.round(cutout.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  if (background.type === "color") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.type === "blur") {
    drawBlurred(ctx, await loadImage(originalUrl), width, height);
  } else if (background.type === "image") {
    drawCover(ctx, await loadImage(background.url), width, height);
  } else if (options.fallbackFill) {
    ctx.fillStyle = options.fallbackFill;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(cutout, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      format === "jpg" ? "image/jpeg" : "image/png",
      format === "jpg" ? 0.95 : undefined
    );
  });
}

export async function exportImage(
  cutoutUrl: string,
  originalUrl: string,
  background: Background,
  format: ExportFormat
): Promise<Blob> {
  const canvas = await composite(cutoutUrl, originalUrl, background, {
    fallbackFill: format === "jpg" ? "#FFFFFF" : undefined,
  });
  return canvasToBlob(canvas, format);
}
