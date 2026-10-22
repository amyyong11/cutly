import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { removeBackground } from "@/lib/background-removal";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_SIZE } from "@/lib/constants";

// The default (BiRefNet) provider loads a large ONNX session on first use,
// which can take upwards of a minute on top of inference time.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    if (
      !ACCEPTED_MIME_TYPES.includes(
        file.type as (typeof ACCEPTED_MIME_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        { error: "unsupported_type" },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "too_large" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    // Phone photos carry an EXIF orientation tag rather than rotated pixels;
    // .rotate() bakes that rotation in so the processed result matches what
    // the browser displays for the original file.
    const imageBuffer = await sharp(Buffer.from(arrayBuffer)).rotate().toBuffer();

    const result = await removeBackground({
      imageBuffer,
      mimeType: file.type,
    });

    return new NextResponse(new Uint8Array(result.imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("remove-background failed:", err);
    return NextResponse.json(
      { error: "processing_failed" },
      { status: 500 }
    );
  }
}
