import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  createSession,
  segmentAt,
  type SegmentPoint,
} from "@/lib/segmentation/sam";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_SIZE } from "@/lib/constants";

// The first request downloads and loads the SAM model.
export const maxDuration = 120;

// Two calls share this route:
//   multipart { image }            -> { sessionId }  (encodes the image once)
//   JSON { sessionId, points }     -> PNG mask       (one per tap)
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      return await handleSegment(request);
    }
    return await handleCreateSession(request);
  } catch (err) {
    console.error("segment failed:", err);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

async function handleCreateSession(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("image") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (
    !ACCEPTED_MIME_TYPES.includes(
      file.type as (typeof ACCEPTED_MIME_TYPES)[number]
    )
  ) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  // Match the orientation used by /api/remove-background so mask pixels
  // line up with the cutout.
  const imageBuffer = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .toBuffer();
  const sessionId = await createSession(imageBuffer);
  return NextResponse.json({ sessionId });
}

async function handleSegment(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;
  const points = body?.points;

  const valid =
    typeof sessionId === "string" &&
    Array.isArray(points) &&
    points.length > 0 &&
    points.length <= 16 &&
    points.every(
      (p: SegmentPoint) =>
        Number.isFinite(p?.x) &&
        Number.isFinite(p?.y) &&
        (p.label === 0 || p.label === 1)
    );
  if (!valid) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const mask = await segmentAt(sessionId, points);
  if (!mask) {
    return NextResponse.json({ error: "session_expired" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(mask), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
