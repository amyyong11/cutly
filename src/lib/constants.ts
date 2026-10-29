export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const ACCEPTED_EXTENSIONS = ["PNG", "JPG", "JPEG", "WebP"];

export const MAX_UPLOAD_SIZE =
  parseInt(process.env.MAX_UPLOAD_SIZE || "52428800", 10) || 52428800;

// Vercel rejects function request and response bodies over 4.5MB. Images and
// results larger than this travel through Vercel Blob instead (leaving
// headroom for multipart overhead).
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

// Pathname prefix for the short-lived blobs used for those transfers.
export const BLOB_PREFIX = "cutly-tmp/";

export const BRUSH_SIZES = [10, 20, 36, 60, 100] as const;

export const BACKGROUND_COLORS = [
  "#FFFFFF",
  "#000000",
  "#E8D5C4",
  "#F4C7C3",
  "#F9E79F",
  "#C8E6C9",
  "#B3E5FC",
  "#C5CAE9",
  "#E1BEE7",
  "#FF6B6B",
  "#4A90D9",
] as const;

export const SAMPLE_IMAGES = [
  { src: "/samples/person.jpg", label: "Person" },
  { src: "/samples/dog.jpg", label: "Animal" },
  { src: "/samples/shoe.jpg", label: "Product" },
  { src: "/samples/car.jpg", label: "Car" },
] as const;
