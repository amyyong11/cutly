import { upload } from "@vercel/blob/client";
import { BLOB_PREFIX, MAX_BODY_BYTES } from "./constants";

// Client half of large-file transfers (see blob-transfer.ts). Set at build
// time from whether a Blob store is connected; without one (e.g. local dev,
// which has no body limit) everything goes through the API directly.
const blobEnabled = process.env.NEXT_PUBLIC_BLOB_UPLOADS === "1";

/** POSTs an image to an API route, via Blob storage if it's too large. */
export async function postImage(endpoint: string, file: Blob): Promise<Response> {
  if (blobEnabled && file.size > MAX_BODY_BYTES) {
    const blob = await upload(`${BLOB_PREFIX}upload`, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: file.type,
    });
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blobUrl: blob.url }),
    });
  }

  const formData = new FormData();
  formData.append("image", file);
  return fetch(endpoint, { method: "POST", body: formData });
}

/** Reads an image response, following a `{ blobUrl }` hand-off if present. */
export async function readImageResponse(response: Response): Promise<Blob> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return response.blob();
  }
  const { blobUrl } = await response.json();
  const result = await fetch(blobUrl, { cache: "no-store" });
  if (!result.ok) throw new Error("Could not download result");
  const blob = await result.blob();
  void fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: blobUrl }),
  }).catch(() => {});
  return blob;
}
