import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPromptChain } from "@/lib/prompt-chain";

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

  const { prompt } = await request.json();

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY." },
      { status: 500 }
    );
  }

  const result = await runPromptChain(supabase, user.id, prompt.trim());

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, retryable: result.retryable },
      { status: 502 }
    );
  }

  const { caption, requestId } = result;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const authorName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "Anonymous";

  const { data: generation, error: insertError } = await supabase
    .from("generations")
    .insert({
      creator_id: user.id,
      author_name: authorName,
      prompt: prompt.trim(),
      caption,
    })
    .select()
    .single();

  if (insertError) {
    await supabase
      .from("generation_requests")
      .update({
        status: "failed",
        error: insertError.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from("generation_requests")
    .update({
      status: "completed",
      generation_id: generation.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  const MILESTONES = [1, 5, 10, 25, 50, 100];
  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", user.id);

  const milestoneCount = count && MILESTONES.includes(count) ? count : null;

  return NextResponse.json({ generation, milestoneCount });
}
