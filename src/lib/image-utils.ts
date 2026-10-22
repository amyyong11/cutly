import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_SIZE } from "./constants";

export type ImageValidationError =
  | "unsupported_type"
  | "too_large"
  | "invalid_file";

export function validateImageFile(file: File): ImageValidationError | null {
  if (
    !ACCEPTED_MIME_TYPES.includes(
      file.type as (typeof ACCEPTED_MIME_TYPES)[number]
    )
  ) {
    return "unsupported_type";
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return "too_large";
  }
  return null;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function getErrorMessage(error: ImageValidationError): string {
  switch (error) {
    case "unsupported_type":
      return "This file type isn't supported. Please upload a PNG, JPG, or WebP image.";
    case "too_large":
      return "This image is too large. Please upload a smaller file.";
    case "invalid_file":
      return "Something went wrong. Please try uploading your image again.";
    default:
      return "Something went wrong. Please try uploading your image again.";
  }
}
