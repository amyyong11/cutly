// Removes background color bleeding from semi-transparent edge pixels (hair,
// fur, motion blur). An edge pixel's observed color is a blend
// I = αF + (1-α)B; without this step, the old background B shows up as a
// colored halo once the cutout is placed on anything new. This solves for
// the pure foreground color F using the multilevel approach from Germer et
// al., "Fast Multi-Level Foreground Estimation" (2020): solve coarse-to-fine,
// with a few Gauss-Seidel sweeps at each level, where neighbors with similar
// alpha are tied together more strongly.

const REGULARIZATION = 1e-5;
const GRADIENT_WEIGHT = 1;
const SMALL_SIZE = 32;
const SMALL_ITERATIONS = 10;
const BIG_ITERATIONS = 2;

// Byte value -> 0-1 float, rounded to float32 as the solver's arrays store it.
const UNIT = Float32Array.from({ length: 256 }, (_, v) => v / 255);

function resizeNearest(
  src: Float32Array<ArrayBuffer>,
  w0: number,
  h0: number,
  w: number,
  h: number,
  channels: number
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h0 - 1, Math.floor((y * h0) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w0 - 1, Math.floor((x * w0) / w));
      const si = (sy * w0 + sx) * channels;
      const di = (y * w + x) * channels;
      for (let c = 0; c < channels; c++) out[di + c] = src[si + c];
    }
  }
  return out;
}

// Nearest-neighbor samples of `rgba` at w x h, as 0-1 floats: RGB when
// `alpha` is false, otherwise the alpha channel. Sampling straight from the
// byte buffer avoids holding full-resolution float copies of the image, which
// matters for memory on large photos.
function sampleRgba(
  rgba: Buffer,
  width: number,
  height: number,
  w: number,
  h: number,
  alpha: boolean
): Float32Array<ArrayBuffer> {
  const channels = alpha ? 1 : 3;
  const offset = alpha ? 3 : 0;
  const out = new Float32Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / w));
      const si = (sy * width + sx) * 4 + offset;
      const di = (y * w + x) * channels;
      for (let c = 0; c < channels; c++) out[di + c] = UNIT[rgba[si + c]];
    }
  }
  return out;
}

/**
 * Replaces the RGB of every partially transparent pixel in `rgba` with its
 * estimated pure foreground color. Fully opaque pixels are left untouched.
 */
export function decontaminateEdges(
  rgba: Buffer,
  width: number,
  height: number
): void {
  const pixelCount = width * height;
  let hasPartial = false;
  for (let i = 0; i < pixelCount; i++) {
    const a = rgba[i * 4 + 3];
    if (a > 0 && a < 255) {
      hasPartial = true;
      break;
    }
  }
  if (!hasPartial) return;

  const levels = Math.ceil(Math.log2(Math.max(width, height)));
  let fg = new Float32Array(3);
  let bg = new Float32Array(3);
  let prevW = 1;
  let prevH = 1;

  for (let level = 0; level <= levels; level++) {
    const w = Math.max(1, Math.round(width ** (level / levels)));
    const h = Math.max(1, Math.round(height ** (level / levels)));

    // At full resolution the image is read straight from `rgba`.
    const full = level === levels;
    const img = full ? null : sampleRgba(rgba, width, height, w, h, false);
    const a = full ? null : sampleRgba(rgba, width, height, w, h, true);
    fg = resizeNearest(fg, prevW, prevH, w, h, 3);
    bg = resizeNearest(bg, prevW, prevH, w, h, 3);
    prevW = w;
    prevH = h;

    const iterations = Math.min(w, h) <= SMALL_SIZE ? SMALL_ITERATIONS : BIG_ITERATIONS;

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < h; y++) {
        const yUp = y > 0 ? y - 1 : 0;
        const yDown = y < h - 1 ? y + 1 : h - 1;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const a0 = a ? a[i] : UNIT[rgba[i * 4 + 3]];
          const a1 = 1 - a0;

          // At full resolution, opaque and empty pixels have a trivial
          // answer; skipping them is what keeps large images fast.
          if (full && (a0 === 1 || a0 === 0)) {
            const target = a0 === 1 ? fg : bg;
            target[i * 3] = UNIT[rgba[i * 4]];
            target[i * 3 + 1] = UNIT[rgba[i * 4 + 1]];
            target[i * 3 + 2] = UNIT[rgba[i * 4 + 2]];
            continue;
          }

          const neighbors = [
            yUp * w + x,
            yDown * w + x,
            y * w + (x > 0 ? x - 1 : 0),
            y * w + (x < w - 1 ? x + 1 : w - 1),
          ];

          let a00 = a0 * a0;
          const a01 = a0 * a1;
          let a11 = a1 * a1;
          let f0 = 0, f1 = 0, f2 = 0;
          let b0 = 0, b1 = 0, b2 = 0;

          for (const j of neighbors) {
            const aj = a ? a[j] : UNIT[rgba[j * 4 + 3]];
            const da = REGULARIZATION + GRADIENT_WEIGHT * Math.abs(a0 - aj);
            a00 += da;
            a11 += da;
            f0 += da * fg[j * 3];
            f1 += da * fg[j * 3 + 1];
            f2 += da * fg[j * 3 + 2];
            b0 += da * bg[j * 3];
            b1 += da * bg[j * 3 + 1];
            b2 += da * bg[j * 3 + 2];
          }

          const r = img ? img[i * 3] : UNIT[rgba[i * 4]];
          const g = img ? img[i * 3 + 1] : UNIT[rgba[i * 4 + 1]];
          const b = img ? img[i * 3 + 2] : UNIT[rgba[i * 4 + 2]];
          f0 += a0 * r; f1 += a0 * g; f2 += a0 * b;
          b0 += a1 * r; b1 += a1 * g; b2 += a1 * b;

          const invDet = 1 / (a00 * a11 - a01 * a01);
          const m00 = invDet * a11;
          const m01 = -invDet * a01;
          const m11 = invDet * a00;

          fg[i * 3] = clamp01(m00 * f0 + m01 * b0);
          fg[i * 3 + 1] = clamp01(m00 * f1 + m01 * b1);
          fg[i * 3 + 2] = clamp01(m00 * f2 + m01 * b2);
          bg[i * 3] = clamp01(m01 * f0 + m11 * b0);
          bg[i * 3 + 1] = clamp01(m01 * f1 + m11 * b1);
          bg[i * 3 + 2] = clamp01(m01 * f2 + m11 * b2);
        }
      }
    }
  }

  for (let i = 0; i < pixelCount; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 255) continue;
    rgba[i * 4] = Math.round(fg[i * 3] * 255);
    rgba[i * 4 + 1] = Math.round(fg[i * 3 + 1] * 255);
    rgba[i * 4 + 2] = Math.round(fg[i * 3 + 2] * 255);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
