import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPromptChain } from "@/lib/prompt-chain";
import { isStyle, withStyle } from "@/lib/taste";

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

  const { prompt, style, count } = await request.json();

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }
  if (prompt.length > 300) {
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

  const input = withStyle(prompt.trim(), isStyle(style) ? style : null);
  const howMany = Math.max(1, Math.min(Number(count) || MAX_OPTIONS, MAX_OPTIONS));

  // Each option is its own chain run (and its own logged request).
  const results = await Promise.all(
    Array.from({ length: howMany }, () =>
      runPromptChain(supabase, user.id, input, { completeOnSuccess: true })
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
