import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { isTransferBlobUrl } from "@/lib/blob-transfer";
import { ACCEPTED_MIME_TYPES, BLOB_PREFIX, MAX_UPLOAD_SIZE } from "@/lib/constants";

// Issues client tokens so the browser can upload images too large for a
// function request directly to Vercel Blob.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(BLOB_PREFIX)) {
          throw new Error("Invalid upload pathname");
        }
        return {
          allowedContentTypes: [...ACCEPTED_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_SIZE,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("upload token failed:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 400 });
  }
}

// Called by the client once it has downloaded a result handed back via Blob.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!isTransferBlobUrl(body?.url)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  await del(body.url).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
