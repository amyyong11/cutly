// Fills small alpha "holes" inside the subject (e.g. a finger the matting
// model dropped to near-zero opacity) via morphological closing — dilate
// then erode the alpha channel. Closing is extensive (result >= input), so
// it can only restore opacity, never erase it, and a small radius keeps it
// from fusing separate parts of the subject (e.g. gaps between fingers).

function slidingExtreme(
  values: Uint8Array,
  width: number,
  height: number,
  radius: number,
  beats: (challenger: number, current: number) => boolean
): Uint8Array {
  const horizontal = new Uint8Array(width * height);
  const dequeX = new Int32Array(width);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let head = 0;
    let tail = 0;
    for (let x = 0; x < width + radius; x++) {
      if (x < width) {
        const v = values[row + x];
        while (tail > head && beats(v, values[row + dequeX[tail - 1]])) tail--;
        dequeX[tail++] = x;
      }
      const writeX = x - radius;
      if (writeX >= 0) {
        while (dequeX[head] < writeX - radius) head++;
        horizontal[row + writeX] = values[row + dequeX[head]];
      }
    }
  }

  const result = new Uint8Array(width * height);
  const dequeY = new Int32Array(height);
  for (let x = 0; x < width; x++) {
    let head = 0;
    let tail = 0;
    for (let y = 0; y < height + radius; y++) {
      if (y < height) {
        const v = horizontal[y * width + x];
        while (tail > head && beats(v, horizontal[dequeY[tail - 1] * width + x])) tail--;
        dequeY[tail++] = y;
      }
      const writeY = y - radius;
      if (writeY >= 0) {
        while (dequeY[head] < writeY - radius) head++;
        result[writeY * width + x] = horizontal[dequeY[head] * width + x];
      }
    }
  }

  return result;
}

const dilate = (values: Uint8Array, width: number, height: number, radius: number) =>
  slidingExtreme(values, width, height, radius, (challenger, current) => challenger >= current);

const erode = (values: Uint8Array, width: number, height: number, radius: number) =>
  slidingExtreme(values, width, height, radius, (challenger, current) => challenger <= current);

export function closeAlphaGaps(
  rgba: Buffer,
  width: number,
  height: number,
  radius: number
): void {
  if (radius < 1) return;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];

  const closed = erode(dilate(alpha, width, height, radius), width, height, radius);

  for (let i = 0; i < closed.length; i++) {
    const idx = i * 4 + 3;
    if (closed[i] > rgba[idx]) rgba[idx] = closed[i];
  }
}
