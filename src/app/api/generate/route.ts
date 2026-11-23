import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPromptChain } from "@/lib/prompt-chain";
import { isStyle, withStyle } from "@/lib/taste";
import { MAX_BASE64_LENGTH, isImageType, type AttachedImage } from "@/lib/caption-image";

const MAX_OPTIONS = 3;

// Writes up to 3 caption options for a situation in the chosen humor style.
// Nothing is posted yet: the author picks one with /api/generate/post.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to generate a caption." },
      { status: 401 }
    );
  }

  const { prompt, style, count, image } = await request.json();

  // A photo can stand in for the written situation.
  let photo: AttachedImage | null = null;
  if (image) {
    if (
      !isImageType(image.mimeType) ||
      typeof image.base64 !== "string" ||
      image.base64.length === 0 ||
      image.base64.length > MAX_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/=]+$/.test(image.base64)
    ) {
      return NextResponse.json(
        { error: "That photo can't be used. Try a smaller JPG, PNG or WebP." },
        { status: 400 }
      );
    }
    photo = { mimeType: image.mimeType, base64: image.base64 };
  }

  const situation = typeof prompt === "string" ? prompt.trim() : "";
  if (!situation && !photo) {
    return NextResponse.json(
      { error: "Describe the situation or add a photo." },
      { status: 400 }
    );
  }
  if (situation.length > 300) {
    return NextResponse.json(
      { error: "Keep the situation under 300 characters." },
      { status: 400 }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY." },
      { status: 500 }
    );
  }

  const input = withStyle(
    situation || "the attached photo",
    isStyle(style) ? style : null
  );
  const howMany = Math.max(1, Math.min(Number(count) || MAX_OPTIONS, MAX_OPTIONS));

  // Each option is its own chain run (and its own logged request).
  const results = await Promise.all(
    Array.from({ length: howMany }, () =>
      runPromptChain(supabase, user.id, input, {
        completeOnSuccess: true,
        image: photo,
        imageOnEveryStep: !!photo,
      })
    )
  );

  const seen = new Set<string>();
  const options = results.flatMap((result) => {
    if (!result.ok) return [];
    const key = result.caption.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ requestId: result.requestId, caption: result.caption }];
  });

  if (options.length === 0) {
    const failure = results.find((result) => !result.ok);
    const error = failure && !failure.ok ? failure.error : "Generation failed.";
    const retryable = results.some((result) => !result.ok && result.retryable);
    return NextResponse.json({ error, retryable }, { status: 502 });
  }

  return NextResponse.json({ options });
}
