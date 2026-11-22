import type { SupabaseClient } from "@supabase/supabase-js";
import type { Caption } from "@/lib/taste";

export type FeedCaption = Caption & {
  creator_id: string;
  author_name: string;
};

// Every caption plus the signed-in user's votes. `select("*")` keeps this
// working before supabase/week11.sql adds the style column.
export async function loadCaptions(
  supabase: SupabaseClient,
  userId: string | null
): Promise<{
  captions: FeedCaption[];
  myVotes: Record<number, 1 | -1>;
  error: string | null;
}> {
  const [{ data, error }, votesResult] = await Promise.all([
    supabase.from("generations").select("*").order("created_at", { ascending: false }),
    userId
      ? supabase.from("votes").select("generation_id, value").eq("user_id", userId)
      : Promise.resolve({ data: [] as { generation_id: number; value: number }[] }),
  ]);

  const captions = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    creator_id: String(row.creator_id ?? ""),
    author_name: String(row.author_name ?? "Anonymous"),
    prompt: String(row.prompt ?? ""),
    caption: String(row.caption ?? ""),
    style: typeof row.style === "string" ? row.style : null,
    upvotes: Number(row.upvotes ?? 0),
    downvotes: Number(row.downvotes ?? 0),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }));

  const myVotes: Record<number, 1 | -1> = Object.fromEntries(
    (votesResult.data ?? []).map((vote) => [vote.generation_id, vote.value as 1 | -1])
  );

  return { captions, myVotes, error: error?.message ?? null };
}
