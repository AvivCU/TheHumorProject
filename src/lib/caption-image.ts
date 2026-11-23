// Photos attached to captions: what's allowed, shared by the browser and server.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_SIDE = 1024; // pixels, longest side after resizing
export const MAX_BASE64_LENGTH = 2_800_000; // ~2 MB of image data sent to the AI
export const IMAGE_BUCKET = "caption-images";

export type AttachedImage = { mimeType: string; base64: string };

export function isImageType(value: unknown): value is (typeof IMAGE_TYPES)[number] {
  return typeof value === "string" && (IMAGE_TYPES as readonly string[]).includes(value);
}

// A photo's public address must live in the signed-in user's own folder of
// our bucket; anything else is ignored.
export function isOwnImageUrl(url: unknown, supabaseUrl: string, userId: string): url is string {
  if (typeof url !== "string") return false;
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/${userId}/`;
  return url.startsWith(prefix) && url.length < 400 && !url.includes("..");
}
