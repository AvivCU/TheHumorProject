import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VoteButtons from "./vote-buttons";

export const dynamic = "force-dynamic";

type Generation = {
  id: number;
  author_name: string;
  prompt: string;
  caption: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
};

export default async function FeedPage() {
  const supabase = await createClient();

  const [{ data: generations, error }, { data: userData }] = await Promise.all([
    supabase
      .from("generations")
      .select("id, author_name, prompt, caption, upvotes, downvotes, created_at")
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const user = userData.user;

  let myVotes: Record<number, 1 | -1> = {};
  if (user) {
    const { data: votes } = await supabase
      .from("votes")
      .select("generation_id, value")
      .eq("user_id", user.id);

    myVotes = Object.fromEntries(
      (votes ?? []).map((vote) => [vote.generation_id, vote.value as 1 | -1])
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-red-600">{error.message}</p>
      </main>
    );
  }

  const items = (generations ?? []) as Generation[];

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Feed
        </h1>
        <Link
          href="/generate"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          + New caption
        </Link>
      </div>

      {!user && (
        <p className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to vote or post your own captions.
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-4">
        {items.length === 0 && (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            No captions yet -- be the first to generate one.
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <p className="text-lg text-zinc-900 dark:text-zinc-50">
              &ldquo;{item.caption}&rdquo;
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              {item.author_name} &middot; prompt: {item.prompt}
            </p>
            <VoteButtons
              generationId={item.id}
              upvotes={item.upvotes}
              downvotes={item.downvotes}
              initialVote={myVotes[item.id] ?? null}
              isSignedIn={Boolean(user)}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
