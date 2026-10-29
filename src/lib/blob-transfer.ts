import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { BLOB_PREFIX, MAX_BODY_BYTES } from "./constants";

// Server half of large-file transfers. Images over Vercel's body limit are
// uploaded by the browser straight to Blob storage and passed here by URL;
// results over the limit are handed back the same way. Each blob is deleted
// as soon as it has been read.

export function isBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Only our own short-lived transfer blobs may be read or deleted. */
export function isTransferBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      url.pathname.startsWith(`/${BLOB_PREFIX}`)
    );
  } catch {
    return false;
  }
}

/** Downloads an uploaded image blob, deletes it, and returns it as a File. */
export async function takeUploadedImage(blobUrl: string): Promise<File> {
  try {
    const response = await fetch(blobUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    return new File([await response.arrayBuffer()], "image", { type });
  } finally {
    await del(blobUrl).catch(() => {});
  }
}

/**
 * Responds with the image directly, or — when it's too large for a function
 * response — stores it in Blob and responds with `{ blobUrl }`. The client
 * deletes that blob once downloaded.
 */
export async function imageResponse(
  buffer: Buffer,
  contentType: string
): Promise<NextResponse> {
  if (buffer.length > MAX_BODY_BYTES && isBlobEnabled()) {
    const blob = await put(`${BLOB_PREFIX}result`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return NextResponse.json(
      { blobUrl: blob.url },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
  });
}
