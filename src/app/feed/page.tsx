import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCaptions, type FeedCaption } from "@/lib/captions";
import {
  STYLES,
  STYLE_KEYS,
  TOPICS,
  TOPIC_KEYS,
  buildTaste,
  isStyle,
  isTopic,
  rankForYou,
  reasonFor,
  topicsOf,
} from "@/lib/taste";
import CaptionBadges from "@/components/caption-badges";
import ShareButton from "@/components/share-button";
import CaptionPhoto from "@/components/caption-photo";
import VoteButtons from "./vote-buttons";

export const dynamic = "force-dynamic";

type SortMode = "foryou" | "new" | "top" | "worst";
type Params = { sort?: string; mine?: string; style?: string; topic?: string; q?: string };

function timeAgo(dateString: string) {
  const diffMinutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
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

function tabClass(active: boolean) {
  return `rounded-full px-3 py-1 text-sm transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;
}

function chipClass(active: boolean) {
  return `rounded-full px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-violet-600 text-white"
      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sortMode: SortMode =
    params.sort === "new" || params.sort === "top" || params.sort === "worst"
      ? params.sort
      : params.sort === "foryou" || user
        ? "foryou"
        : "new";
  const mineOnly = params.mine === "1" && !!user;
  const style = isStyle(params.style) ? params.style : null;
  const topic = isTopic(params.topic) ? params.topic : null;
  const query = (params.q ?? "").trim().slice(0, 80);

  const { captions, myVotes, error } = await loadCaptions(supabase, user?.id ?? null);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  const taste = buildTaste(captions, myVotes);

  // Filters first, then the chosen order.
  let items: FeedCaption[] = captions;
  if (mineOnly) items = items.filter((item) => item.creator_id === user!.id);
  if (style) items = items.filter((item) => item.style === style);
  if (topic) items = items.filter((item) => topicsOf(`${item.prompt} ${item.caption}`).includes(topic));
  if (query) {
    const needle = query.toLowerCase();
    items = items.filter(
      (item) =>
        item.caption.toLowerCase().includes(needle) || item.prompt.toLowerCase().includes(needle)
    );
  }

  const net = (item: FeedCaption) => item.upvotes - item.downvotes;
  if (sortMode === "foryou") items = rankForYou(items, taste);
  if (sortMode === "top") items = [...items].sort((a, b) => net(b) - net(a));
  if (sortMode === "worst") items = [...items].sort((a, b) => net(a) - net(b));

  // Only offer filters that match something.
  const stylesPresent = STYLE_KEYS.filter((key) => captions.some((item) => item.style === key));
  const topicCounts = TOPIC_KEYS.map((key) => ({
    key,
    count: captions.filter((item) => topicsOf(`${item.prompt} ${item.caption}`).includes(key)).length,
  })).filter((entry) => entry.count > 0);

  const href = (patch: Partial<Record<keyof Params, string | null>>) => {
    const next = new URLSearchParams();
    const merged = {
      sort: sortMode,
      mine: mineOnly ? "1" : null,
      style,
      topic,
      q: query || null,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/feed?${next.toString()}`;
  };
  const filtered = !!style || !!topic || !!query;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Feed</h1>
        <div className="flex gap-2">
          <Link
            href="/rate"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            😂 Rate
          </Link>
          <Link
            href="/generate"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + New caption
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Sort" className="flex flex-wrap gap-2">
          {user && (
            <Link href={href({ sort: "foryou" })} className={tabClass(sortMode === "foryou")}>
              ✨ For You
            </Link>
          )}
          <Link href={href({ sort: "new" })} className={tabClass(sortMode === "new")}>
            New
          </Link>
          <Link href={href({ sort: "top" })} className={tabClass(sortMode === "top")}>
            Top
          </Link>
          <Link href={href({ sort: "worst" })} className={tabClass(sortMode === "worst")}>
            Most Disliked
          </Link>
        </nav>
        {user && (
          <div className="flex gap-2">
            <Link href={href({ mine: null })} className={tabClass(!mineOnly)}>
              All
            </Link>
            <Link href={href({ mine: "1" })} className={tabClass(mineOnly)}>
              Mine
            </Link>
          </div>
        )}
      </div>

      <form action="/feed" className="mt-4 flex gap-2" role="search">
        <input type="hidden" name="sort" value={sortMode} />
        {mineOnly && <input type="hidden" name="mine" value="1" />}
        {style && <input type="hidden" name="style" value={style} />}
        {topic && <input type="hidden" name="topic" value={topic} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search captions, e.g. Butler, finals, roommate"
          aria-label="Search captions"
          className="h-10 flex-1 rounded-full border border-zinc-300 px-4 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="h-10 rounded-full border border-zinc-300 px-4 text-sm dark:border-zinc-700"
        >
          Search
        </button>
      </form>

      {(stylesPresent.length > 0 || topicCounts.length > 0) && (
        <div className="mt-3 flex flex-col gap-2">
          {stylesPresent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by style">
              <span className="text-xs text-zinc-500">Style:</span>
              {stylesPresent.map((key) => (
                <Link
                  key={key}
                  href={href({ style: style === key ? null : key })}
                  aria-pressed={style === key}
                  className={chipClass(style === key)}
                >
                  {STYLES[key].emoji} {STYLES[key].label}
                </Link>
              ))}
            </div>
          )}
          {topicCounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by topic">
              <span className="text-xs text-zinc-500">About:</span>
              {topicCounts.map(({ key, count }) => (
                <Link
                  key={key}
                  href={href({ topic: topic === key ? null : key })}
                  aria-pressed={topic === key}
                  className={chipClass(topic === key)}
                >
                  {TOPICS[key].emoji} {TOPICS[key].label} <span className="opacity-60">{count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!user && (
        <p className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to vote, get a For You feed, and post your own captions.
        </p>
      )}
      {user && sortMode === "foryou" && taste.votes < 3 && (
        <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-100">
          <span>Rate a few captions and this feed will learn what makes you laugh.</span>
          <Link href="/rate" className="font-medium underline">
            Start rating
          </Link>
        </p>
      )}

      <p className="mt-4 text-xs text-zinc-500" aria-live="polite">
        {items.length} caption{items.length === 1 ? "" : "s"}
        {query ? ` matching “${query}”` : ""}
        {filtered && (
          <>
            {" · "}
            <Link href={href({ style: null, topic: null, q: null })} className="underline">
              clear filters
            </Link>
          </>
        )}
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {items.length === 0 && (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            {mineOnly
              ? "You haven't posted anything yet."
              : filtered
                ? "Nothing matches those filters yet."
                : "No captions yet -- be the first to generate one."}
          </li>
        )}
        {items.map((item) => {
          const reason = sortMode === "foryou" ? reasonFor(item, taste) : null;
          return (
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
                  <span className="text-xs text-zinc-400">{timeAgo(item.created_at)}</span>
                </div>
              </div>

              {reason && (
                <p className="mt-3 text-xs font-medium text-violet-700 dark:text-violet-300">
                  {reason}
                </p>
              )}
              <CaptionPhoto url={item.image_url} />
              <p className="mt-3 text-lg text-zinc-900 dark:text-zinc-50">{item.caption}</p>
              {item.prompt && (
                <p className="mt-1 text-xs italic text-zinc-400">about: {item.prompt}</p>
              )}
              <CaptionBadges item={item} />

              <div className="flex flex-wrap items-center gap-3">
                <VoteButtons
                  generationId={item.id}
                  upvotes={item.upvotes}
                  downvotes={item.downvotes}
                  initialVote={myVotes[item.id] ?? null}
                  isSignedIn={Boolean(user)}
                  userId={user?.id ?? null}
                />
                <div className="mt-3">
                  <ShareButton caption={item.caption} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
