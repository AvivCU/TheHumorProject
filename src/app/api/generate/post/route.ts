import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCaption } from "@/lib/prompt-chain";
import { splitStyledPrompt } from "@/lib/taste";

const MILESTONES = [1, 5, 10, 25, 50, 100];

// Post the option the author picked. The caption, situation and style are
// read back from the author's own logged request, never trusted from the
// browser, so only real AI output can be posted, and only once.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to post a caption." },
      { status: 401 }
    );
  }

  const { requestId } = await request.json();
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: "Pick a caption to post." }, { status: 400 });
  }

  const { data: generationRequest } = await supabase
    .from("generation_requests")
    .select("id, prompt, output, status, generation_id")
    .eq("id", requestId)
    .eq("user_id", user.id)
    .maybeSingle();

  const caption = cleanCaption(generationRequest?.output ?? "");
  if (!generationRequest || generationRequest.status !== "completed" || !caption) {
    return NextResponse.json(
      { error: "That caption isn't available anymore. Try generating again." },
      { status: 400 }
    );
  }
  if (generationRequest.generation_id) {
    return NextResponse.json({ error: "You already posted this one." }, { status: 409 });
  }

  const { situation, style } = splitStyledPrompt(generationRequest.prompt);

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const authorName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "Anonymous";

  const row = {
    creator_id: user.id,
    author_name: authorName,
    prompt: situation,
    caption,
    request_id: requestId,
    style,
  };

  let insert = await supabase.from("generations").insert(row).select().single();
  // Before supabase/week11.sql is run there is no style column: post without it.
  if (insert.error && /style/i.test(insert.error.message)) {
    const { style: _unused, ...withoutStyle } = row;
    void _unused;
    insert = await supabase.from("generations").insert(withoutStyle).select().single();
  }

  if (insert.error || !insert.data) {
    return NextResponse.json(
      { error: insert.error?.message ?? "Could not post the caption." },
      { status: 500 }
    );
  }

  await supabase
    .from("generation_requests")
    .update({ generation_id: insert.data.id })
    .eq("id", requestId);

  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", user.id);

  const milestoneCount = count && MILESTONES.includes(count) ? count : null;

  return NextResponse.json({ generation: insert.data, milestoneCount });
}
