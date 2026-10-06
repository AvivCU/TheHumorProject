import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VoteButtons from "./vote-buttons";

export const dynamic = "force-dynamic";

type Generation = {
  id: number;
  creator_id: string;
  author_name: string;
  prompt: string;
  caption: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
};

type SortMode = "new" | "top" | "worst";

function timeAgo(dateString: string) {
  const diffMinutes = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 60000
  );
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function sortTabClass(active: boolean) {
  return `rounded-full px-3 py-1 text-sm transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; mine?: string }>;
}) {
  const { sort, mine } = await searchParams;
  const sortMode: SortMode =
    sort === "top" || sort === "worst" ? sort : "new";
  const mineOnly = mine === "1";

  const supabase = await createClient();

  const [{ data: generations, error }, { data: userData }] =
    await Promise.all([
      supabase
        .from("generations")
        .select(
          "id, creator_id, author_name, prompt, caption, upvotes, downvotes, created_at"
        )
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

  let items = (generations ?? []) as Generation[];

  if (user && mineOnly) {
    items = items.filter((item) => item.creator_id === user.id);
  }

  if (sortMode === "top") {
    items = [...items].sort(
      (a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes)
    );
  } else if (sortMode === "worst") {
    items = [...items].sort(
      (a, b) => a.upvotes - a.downvotes - (b.upvotes - b.downvotes)
    );
  }

  const mineHref = (nextSort: SortMode) =>
    `/feed?sort=${nextSort}${mineOnly ? "&mine=1" : ""}`;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Feed
        </h1>
        <Link
          href="/generate"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          + New caption
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link href={mineHref("new")} className={sortTabClass(sortMode === "new")}>
            New
          </Link>
          <Link href={mineHref("top")} className={sortTabClass(sortMode === "top")}>
            Top
          </Link>
          <Link
            href={mineHref("worst")}
            className={sortTabClass(sortMode === "worst")}
          >
            Most Disliked
          </Link>
        </div>

        {user && (
          <div className="flex gap-2">
            <Link
              href={`/feed?sort=${sortMode}`}
              className={sortTabClass(!mineOnly)}
            >
              All
            </Link>
            <Link
              href={`/feed?sort=${sortMode}&mine=1`}
              className={sortTabClass(mineOnly)}
            >
              Mine
            </Link>
          </div>
        )}
      </div>

      {!user && (
        <p className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to vote or post your own captions.
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {items.length === 0 && (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            {mineOnly
              ? "You haven't posted anything yet."
              : "No captions yet -- be the first to generate one."}
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {initials(item.author_name)}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {item.author_name}
                </span>
                <span className="text-xs text-zinc-400">
                  {timeAgo(item.created_at)}
                </span>
              </div>
            </div>

            <p className="mt-3 text-lg text-zinc-900 dark:text-zinc-50">
              {item.caption}
            </p>
            <p className="mt-1 text-xs italic text-zinc-400">
              prompt: {item.prompt}
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
