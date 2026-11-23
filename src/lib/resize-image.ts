// Shrink a photo in the browser before it is sent to the AI and stored:
// longest side 1024px, JPEG. Keeps uploads fast and well under the limits.
import { MAX_IMAGE_SIDE } from "@/lib/caption-image";

export type ResizedImage = { blob: Blob; base64: string; previewUrl: string };

export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser can't process photos.");
  context.fillStyle = "#ffffff"; // PNGs with transparency become white, not black
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82)
  );
  if (!blob) throw new Error("Could not read that photo.");

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { blob, base64: btoa(binary), previewUrl: URL.createObjectURL(blob) };
}
