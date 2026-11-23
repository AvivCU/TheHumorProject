import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCaption } from "@/lib/prompt-chain";
import { splitStyledPrompt } from "@/lib/taste";
import { isOwnImageUrl } from "@/lib/caption-image";

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

  const { requestId, imageUrl } = await request.json();
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

  const photoUrl = isOwnImageUrl(imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL!, user.id)
    ? imageUrl
    : null;

  const row = {
    creator_id: user.id,
    author_name: authorName,
    // A photo-only caption has no written situation.
    prompt: situation === "the attached photo" ? "" : situation,
    caption,
    request_id: requestId,
    style,
    image_url: photoUrl,
  };

  let insert = await supabase.from("generations").insert(row).select().single();
  // Before supabase/week11.sql is run the style / image_url columns don't
  // exist: post without them rather than failing.
  if (insert.error && /style|image_url/i.test(insert.error.message)) {
    const { style: _style, image_url: _image, ...plain } = row;
    void _style;
    void _image;
    insert = await supabase.from("generations").insert(plain).select().single();
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
