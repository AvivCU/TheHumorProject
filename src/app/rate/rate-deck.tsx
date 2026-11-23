"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { FeedCaption } from "@/lib/captions";
import { buildTaste, rankForYou, reasonFor } from "@/lib/taste";
import CaptionBadges from "@/components/caption-badges";
import HumorProfileCard from "@/components/humor-profile-card";
import CaptionPhoto from "@/components/caption-photo";

const SWIPE_THRESHOLD = 100;
const TUNED_AFTER = 5;

type Vote = 1 | -1;
type Result = { id: number; value: Vote; percent: number };

export default function RateDeck({
  captions,
  initialVotes,
  userId,
}: {
  captions: FeedCaption[];
  initialVotes: Record<number, Vote>;
  userId: string;
}) {
  const [votes, setVotes] = useState(initialVotes);
  const [history, setHistory] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const startX = useRef(0);

  // The order is fixed when the page opens, ranked by your taste so far.
  // Other people's captions come first; your own come last so a young app
  // still has something to rate.
  const [deck] = useState(() => {
    const ranked = rankForYou(
      captions.filter((item) => !initialVotes[item.id]),
      buildTaste(captions, initialVotes)
    );
    return [
      ...ranked.filter((item) => item.creator_id !== userId),
      ...ranked.filter((item) => item.creator_id === userId),
    ];
  });
  const remaining = deck.filter((item) => !votes[item.id] || item.id === result?.id);
  const current = remaining[0];
  const taste = useMemo(() => buildTaste(captions, votes), [captions, votes]);
  const ratedNow = history.length;

  const vote = useCallback(
    (value: Vote) => {
      if (!current || result) return;
      const total = current.upvotes + current.downvotes + 1;
      const ups = current.upvotes + (value === 1 ? 1 : 0);
      setResult({ id: current.id, value, percent: Math.round((ups / total) * 100) });
      setVotes((existing) => ({ ...existing, [current.id]: value }));
      setHistory((existing) => [...existing, current.id]);
      setDragX(0);
      setError("");

      createClient()
        .from("votes")
        .upsert(
          { generation_id: current.id, user_id: userId, value },
          { onConflict: "generation_id,user_id" }
        )
        .then(({ error: writeError }) => {
          if (writeError) setError("That vote didn't save. Check your connection.");
        });

      // Show how everyone else voted, then move on.
      window.setTimeout(() => setResult(null), 1100);
    },
    [current, result, userId]
  );

  const undo = useCallback(() => {
    const lastId = history[history.length - 1];
    if (lastId === undefined || result) return;
    setHistory((existing) => existing.slice(0, -1));
    setVotes((existing) => {
      const next = { ...existing };
      delete next[lastId];
      return next;
    });
    createClient()
      .from("votes")
      .delete()
      .eq("generation_id", lastId)
      .eq("user_id", userId)
      .then(() => undefined);
  }, [history, result, userId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") vote(1);
      if (event.key === "ArrowLeft") vote(-1);
      if (event.key.toLowerCase() === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote, undo]);

  const tilt = result ? 0 : dragX;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span aria-live="polite">
          {ratedNow} rated · {Math.max(0, remaining.length - (result ? 1 : 0))} left
        </span>
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0 || !!result}
          className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
        >
          ↶ Undo
        </button>
      </div>

      {ratedNow > 0 && ratedNow < TUNED_AFTER && (
        <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {TUNED_AFTER - ratedNow} more to tune your For You feed
          </span>
          <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-50"
              style={{ width: `${(ratedNow / TUNED_AFTER) * 100}%` }}
            />
          </div>
        </div>
      )}
      {ratedNow >= TUNED_AFTER && (
        <Link
          href="/feed?sort=foryou"
          className="rounded-full bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200"
        >
          ✨ Your feed is tuned — see For You
        </Link>
      )}

      {current ? (
        <article
          aria-label={`Caption: ${current.caption}`}
          onPointerDown={(event) => {
            if (result) return;
            startX.current = event.clientX;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragging) setDragX(event.clientX - startX.current);
          }}
          onPointerUp={() => {
            if (!dragging) return;
            setDragging(false);
            if (Math.abs(dragX) > SWIPE_THRESHOLD) vote(dragX > 0 ? 1 : -1);
            else setDragX(0);
          }}
          onPointerCancel={() => {
            setDragging(false);
            setDragX(0);
          }}
          style={{
            transform: `translateX(${tilt}px) rotate(${tilt / 20}deg)`,
            transition: dragging ? "none" : "transform 200ms ease",
            touchAction: "pan-y",
          }}
          className="relative flex min-h-64 cursor-grab select-none flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div>
            <CaptionPhoto url={current.image_url} tall />
            <p className="mt-4 text-2xl font-medium leading-snug text-zinc-900 dark:text-zinc-50">
              {current.caption}
            </p>
            {current.prompt && (
              <p className="mt-2 text-sm italic text-zinc-500 dark:text-zinc-400">
                about: {current.prompt}
              </p>
            )}
            <CaptionBadges item={current} />
            {reasonFor(current, taste) && (
              <p className="mt-3 text-xs font-medium text-violet-700 dark:text-violet-300">
                {reasonFor(current, taste)}
              </p>
            )}
          </div>
          <p className="mt-6 text-xs text-zinc-400">
            by {current.creator_id === userId ? "you" : current.author_name}
          </p>

          {result && result.id === current.id && (
            <div
              role="status"
              className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl text-center ${
                result.value === 1
                  ? "bg-emerald-50/95 text-emerald-900 dark:bg-emerald-950/95 dark:text-emerald-100"
                  : "bg-zinc-100/95 text-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-100"
              }`}
            >
              <span className="text-5xl" aria-hidden="true">
                {result.value === 1 ? "😂" : "😐"}
              </span>
              <span className="mt-2 text-lg font-semibold">
                {result.percent}% of people laughed
              </span>
            </div>
          )}
          {!result && dragX > 30 && (
            <span className="absolute right-4 top-4 rounded-lg border-2 border-emerald-500 px-2 py-1 font-bold text-emerald-600">
              😂 FUNNY
            </span>
          )}
          {!result && dragX < -30 && (
            <span className="absolute left-4 top-4 rounded-lg border-2 border-zinc-400 px-2 py-1 font-bold text-zinc-500">
              😐 NAH
            </span>
          )}
        </article>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            You&apos;re all caught up 🎉
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You&apos;ve rated every caption. Write a new one or see your feed.
          </p>
          <div className="flex gap-3">
            <Link href="/generate" className="rounded-full bg-foreground px-4 py-2 text-sm text-background">
              Write a caption
            </Link>
            <Link
              href="/feed?sort=foryou"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              For You feed
            </Link>
          </div>
        </div>
      )}

      {current && (
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => vote(-1)}
            disabled={!!result}
            aria-label="Not funny"
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-300 bg-white text-3xl shadow transition-transform hover:scale-105 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          >
            😐
          </button>
          <button
            type="button"
            onClick={() => vote(1)}
            disabled={!!result}
            aria-label="Funny"
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400 bg-white text-3xl shadow transition-transform hover:scale-105 disabled:opacity-50 dark:bg-zinc-950"
          >
            😂
          </button>
        </div>
      )}
      <p className="hidden text-center text-xs text-zinc-400 sm:block">Keyboard: ← nah · → funny · Z undo</p>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <HumorProfileCard taste={taste} />
    </div>
  );
}
