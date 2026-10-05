import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You write short, funny one-or-two sentence captions for a college humor app. Write one witty caption about: ${prompt}. Respond with only the caption text, no quotes, no extra commentary.`,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    return NextResponse.json(
      { error: `Generation failed: ${errorText}` },
      { status: 502 }
    );
  }

  const geminiData = await geminiResponse.json();
  const caption: string | undefined =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!caption) {
    return NextResponse.json(
      { error: "The model didn't return any text." },
      { status: 502 }
    );
  }

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
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ generation });
}
