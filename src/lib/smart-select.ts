export interface SelectPoint {
  x: number;
  y: number;
  label: 0 | 1;
}

// One instance per image, so reopening the editor reuses the prepared
// session instead of encoding the image again.
const instances = new Map<string, SmartSelect>();

/**
 * Client for /api/segment. The server caches the image encoding per session
 * and may evict it, and preparing a session can fail transiently (e.g. while
 * the server restarts), so both cases are recovered from on the next call
 * rather than leaving smart select broken.
 */
export class SmartSelect {
  private sessionId: Promise<string>;
  private failed = false;

  static for(imageUrl: string): SmartSelect {
    let instance = instances.get(imageUrl);
    if (!instance) {
      instance = new SmartSelect(imageUrl);
      instances.set(imageUrl, instance);
    }
    return instance;
  }

  private constructor(private readonly imageUrl: string) {
    this.sessionId = this.createSession();
  }

  /** Resolves once the image is encoded and taps will be fast. */
  ready(): Promise<unknown> {
    if (this.failed) this.sessionId = this.createSession();
    return this.sessionId;
  }

  private createSession(): Promise<string> {
    this.failed = false;
    const session = (async () => {
      const image = await (await fetch(this.imageUrl)).blob();
      const formData = new FormData();
      formData.append("image", image);
      const response = await fetch("/api/segment", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Could not prepare smart select");
      const { sessionId } = await response.json();
      return sessionId as string;
    })();
    session.catch(() => {
      if (this.sessionId === session) this.failed = true;
    });
    return session;
  }

  /**
   * Returns the selection mask (one byte per pixel, 255 = selected) for the
   * object part under the given points.
   */
  async maskAt(
    points: SelectPoint[],
    width: number,
    height: number,
    signal?: AbortSignal
  ): Promise<Uint8ClampedArray> {
    let response = await this.request(points, signal);
    if (response.status === 404) {
      this.sessionId = this.createSession();
      response = await this.request(points, signal);
    }
    if (!response.ok) throw new Error("Smart select failed");

    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const rgba = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8ClampedArray(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4];
    return mask;
  }

  private async request(points: SelectPoint[], signal?: AbortSignal) {
    return fetch("/api/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: await this.ready(), points }),
      signal,
    });
  }
}
