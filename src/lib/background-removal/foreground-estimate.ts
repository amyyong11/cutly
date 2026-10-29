// Removes background color bleeding from semi-transparent edge pixels (hair,
// fur, motion blur). An edge pixel's observed color is a blend
// I = αF + (1-α)B; without this step, the old background B shows up as a
// colored halo once the cutout is placed on anything new. This solves for
// the pure foreground color F using the multilevel approach from Germer et
// al., "Fast Multi-Level Foreground Estimation" (2020): solve coarse-to-fine,
// with a few Gauss-Seidel sweeps at each level, where neighbors with similar
// alpha are tied together more strongly.
//
// Memory is kept proportional to the edge, not the photo, so large images
// fit in a serverless function: the image is always read straight from the
// RGBA buffer, and at full resolution F and B are only stored for the
// partially transparent pixels (opaque and empty pixels have a trivial
// answer there).

const REGULARIZATION = 1e-5;
const GRADIENT_WEIGHT = 1;
const SMALL_SIZE = 32;
const SMALL_ITERATIONS = 10;
const BIG_ITERATIONS = 2;

// Byte value -> 0-1 float, rounded to float32 as the solver's arrays store it.
const UNIT = Float32Array.from({ length: 256 }, (_, v) => v / 255);

// One pixel's four neighbors (up, down, left, right): alpha, then F and B
// RGB. Filled by the callers, read by solvePixel.
const neighborAlpha = new Float64Array(4);
const neighborFg = new Float64Array(12);
const neighborBg = new Float64Array(12);
// solvePixel's result: F RGB, then B RGB.
const solved = new Float64Array(6);

function iterationsFor(w: number, h: number): number {
  return Math.min(w, h) <= SMALL_SIZE ? SMALL_ITERATIONS : BIG_ITERATIONS;
}

/** Index map from a w-pixel axis onto a nearest-neighbor source axis. */
function nearestMap(w: number, source: number, stride = 1): Int32Array {
  const map = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    map[x] = Math.min(source - 1, Math.floor((x * source) / w)) * stride;
  }
  return map;
}

function resizeNearest(
  src: Float32Array<ArrayBuffer>,
  w0: number,
  h0: number,
  w: number,
  h: number
): Float32Array<ArrayBuffer> {
  const cols = nearestMap(w, w0);
  const rows = nearestMap(h, h0, w0);
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (rows[y] + cols[x]) * 3;
      const di = (y * w + x) * 3;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
    }
  }
  return out;
}

function solvePixel(a0: number, r: number, g: number, b: number): void {
  const a1 = 1 - a0;
  let a00 = a0 * a0;
  const a01 = a0 * a1;
  let a11 = a1 * a1;
  let f0 = 0, f1 = 0, f2 = 0;
  let b0 = 0, b1 = 0, b2 = 0;

  for (let n = 0; n < 4; n++) {
    const da = REGULARIZATION + GRADIENT_WEIGHT * Math.abs(a0 - neighborAlpha[n]);
    a00 += da;
    a11 += da;
    f0 += da * neighborFg[n * 3];
    f1 += da * neighborFg[n * 3 + 1];
    f2 += da * neighborFg[n * 3 + 2];
    b0 += da * neighborBg[n * 3];
    b1 += da * neighborBg[n * 3 + 1];
    b2 += da * neighborBg[n * 3 + 2];
  }

  f0 += a0 * r; f1 += a0 * g; f2 += a0 * b;
  b0 += a1 * r; b1 += a1 * g; b2 += a1 * b;

  const invDet = 1 / (a00 * a11 - a01 * a01);
  const m00 = invDet * a11;
  const m01 = -invDet * a01;
  const m11 = invDet * a00;

  solved[0] = clamp01(m00 * f0 + m01 * b0);
  solved[1] = clamp01(m00 * f1 + m01 * b1);
  solved[2] = clamp01(m00 * f2 + m01 * b2);
  solved[3] = clamp01(m01 * f0 + m11 * b0);
  solved[4] = clamp01(m01 * f1 + m11 * b1);
  solved[5] = clamp01(m01 * f2 + m11 * b2);
}

/** Gauss-Seidel sweeps over every pixel of a downscaled (w x h) level. */
function solveCoarseLevel(
  rgba: Buffer,
  width: number,
  height: number,
  fg: Float32Array<ArrayBuffer>,
  bg: Float32Array<ArrayBuffer>,
  w: number,
  h: number
): void {
  // Pixel (x, y) of this level samples rgba at (rows[y] + cols[x]) * 4.
  const cols = nearestMap(w, width);
  const rows = nearestMap(h, height, width);
  const iterations = iterationsFor(w, h);

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < h; y++) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDown = y < h - 1 ? y + 1 : h - 1;
      for (let x = 0; x < w; x++) {
        const xLeft = x > 0 ? x - 1 : 0;
        const xRight = x < w - 1 ? x + 1 : w - 1;
        gatherCoarse(rgba, fg, bg, w, rows, cols, 0, x, yUp);
        gatherCoarse(rgba, fg, bg, w, rows, cols, 1, x, yDown);
        gatherCoarse(rgba, fg, bg, w, rows, cols, 2, xLeft, y);
        gatherCoarse(rgba, fg, bg, w, rows, cols, 3, xRight, y);

        const s = (rows[y] + cols[x]) * 4;
        solvePixel(UNIT[rgba[s + 3]], UNIT[rgba[s]], UNIT[rgba[s + 1]], UNIT[rgba[s + 2]]);

        const i = (y * w + x) * 3;
        fg[i] = solved[0];
        fg[i + 1] = solved[1];
        fg[i + 2] = solved[2];
        bg[i] = solved[3];
        bg[i + 1] = solved[4];
        bg[i + 2] = solved[5];
      }
    }
  }
}

function gatherCoarse(
  rgba: Buffer,
  fg: Float32Array<ArrayBuffer>,
  bg: Float32Array<ArrayBuffer>,
  w: number,
  rows: Int32Array,
  cols: Int32Array,
  n: number,
  x: number,
  y: number
): void {
  const j = (y * w + x) * 3;
  neighborAlpha[n] = UNIT[rgba[(rows[y] + cols[x]) * 4 + 3]];
  neighborFg[n * 3] = fg[j];
  neighborFg[n * 3 + 1] = fg[j + 1];
  neighborFg[n * 3 + 2] = fg[j + 2];
  neighborBg[n * 3] = bg[j];
  neighborBg[n * 3 + 1] = bg[j + 1];
  neighborBg[n * 3 + 2] = bg[j + 2];
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
  let partialCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    const a = rgba[i * 4 + 3];
    if (a > 0 && a < 255) partialCount++;
  }
  if (partialCount === 0) return;

  const levels = Math.ceil(Math.log2(Math.max(width, height)));
  let fg = new Float32Array(3);
  let bg = new Float32Array(3);
  let prevW = 1;
  let prevH = 1;

  for (let level = 0; level < levels; level++) {
    const w = Math.max(1, Math.round(width ** (level / levels)));
    const h = Math.max(1, Math.round(height ** (level / levels)));
    fg = resizeNearest(fg, prevW, prevH, w, h);
    bg = resizeNearest(bg, prevW, prevH, w, h);
    prevW = w;
    prevH = h;
    solveCoarseLevel(rgba, width, height, fg, bg, w, h);
  }

  solveFullLevel(rgba, width, height, fg, bg, prevW, prevH, partialCount);
}

/**
 * The final, full-resolution level. Its starting estimate is the coarse
 * level upsampled, which is read through `coarseFg`/`coarseBg` on demand
 * rather than materialized. Only partial pixels are solved; an opaque pixel's
 * F (and an empty pixel's B) becomes its own color once the sweep reaches it,
 * which is reproduced here by checking whether it has been visited.
 */
function solveFullLevel(
  rgba: Buffer,
  width: number,
  height: number,
  coarseFg: Float32Array<ArrayBuffer>,
  coarseBg: Float32Array<ArrayBuffer>,
  coarseW: number,
  coarseH: number,
  partialCount: number
): void {
  // Pixel (x, y) starts from the coarse estimate at (rows[y] + cols[x]) * 3.
  const cols = nearestMap(width, coarseW);
  const rows = nearestMap(height, coarseH, coarseW);

  // Partial pixels in raster order; row y's are at [rowStart[y], rowStart[y + 1]).
  const partial = new Int32Array(partialCount);
  const rowStart = new Int32Array(height + 1);
  const fg = new Float32Array(partialCount * 3);
  const bg = new Float32Array(partialCount * 3);
  let k = 0;
  for (let y = 0; y < height; y++) {
    rowStart[y] = k;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = rgba[i * 4 + 3];
      if (a === 0 || a === 255) continue;
      partial[k] = i;
      const c = (rows[y] + cols[x]) * 3;
      for (let ch = 0; ch < 3; ch++) {
        fg[k * 3 + ch] = coarseFg[c + ch];
        bg[k * 3 + ch] = coarseBg[c + ch];
      }
      k++;
    }
  }
  rowStart[height] = k;

  const slotOf = (y: number, i: number): number => {
    let lo = rowStart[y];
    let hi = rowStart[y + 1] - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (partial[mid] < i) lo = mid + 1;
      else if (partial[mid] > i) hi = mid - 1;
      else return mid;
    }
    return -1;
  };

  const gather = (n: number, x: number, y: number, i: number, iter: number) => {
    const j = y * width + x;
    const aj = rgba[j * 4 + 3];
    neighborAlpha[n] = UNIT[aj];
    if (aj > 0 && aj < 255) {
      const slot = slotOf(y, j);
      for (let ch = 0; ch < 3; ch++) {
        neighborFg[n * 3 + ch] = fg[slot * 3 + ch];
        neighborBg[n * 3 + ch] = bg[slot * 3 + ch];
      }
      return;
    }
    const visited = iter > 0 || j < i;
    const c = (rows[y] + cols[x]) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const own = UNIT[rgba[j * 4 + ch]];
      neighborFg[n * 3 + ch] = aj === 255 && visited ? own : coarseFg[c + ch];
      neighborBg[n * 3 + ch] = aj === 0 && visited ? own : coarseBg[c + ch];
    }
  };

  const iterations = iterationsFor(width, height);
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDown = y < height - 1 ? y + 1 : height - 1;
      for (let s = rowStart[y]; s < rowStart[y + 1]; s++) {
        const i = partial[s];
        const x = i - y * width;
        gather(0, x, yUp, i, iter);
        gather(1, x, yDown, i, iter);
        gather(2, x > 0 ? x - 1 : 0, y, i, iter);
        gather(3, x < width - 1 ? x + 1 : width - 1, y, i, iter);

        solvePixel(UNIT[rgba[i * 4 + 3]], UNIT[rgba[i * 4]], UNIT[rgba[i * 4 + 1]], UNIT[rgba[i * 4 + 2]]);
        fg[s * 3] = solved[0];
        fg[s * 3 + 1] = solved[1];
        fg[s * 3 + 2] = solved[2];
        bg[s * 3] = solved[3];
        bg[s * 3 + 1] = solved[4];
        bg[s * 3 + 2] = solved[5];
      }
    }
  }

  // Empty pixels keep the coarse estimate as their (invisible) color.
  k = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = rgba[i * 4 + 3];
      if (a === 255) continue;
      let src: Float32Array<ArrayBuffer>;
      let c: number;
      if (a === 0) {
        src = coarseFg;
        c = (rows[y] + cols[x]) * 3;
      } else {
        src = fg;
        c = k++ * 3;
      }
      rgba[i * 4] = Math.round(src[c] * 255);
      rgba[i * 4 + 1] = Math.round(src[c + 1] * 255);
      rgba[i * 4 + 2] = Math.round(src[c + 2] * 255);
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
