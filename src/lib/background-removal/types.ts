export interface BackgroundRemovalInput {
  imageBuffer: Buffer;
  mimeType: string;
}

export interface BackgroundRemovalResult {
  imageBuffer: Buffer;
  mimeType: "image/png";
}

export interface BackgroundRemovalProvider {
  name: string;
  removeBackground(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}
