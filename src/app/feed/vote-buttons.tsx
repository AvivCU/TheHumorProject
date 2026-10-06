"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  generationId: number;
  upvotes: number;
  downvotes: number;
  initialVote: 1 | -1 | null;
  isSignedIn: boolean;
  userId: string | null;
};

export default function VoteButtons({
  generationId,
  upvotes,
  downvotes,
  initialVote,
  isSignedIn,
  userId,
}: Props) {
  const [vote, setVote] = useState(initialVote);
  const [counts, setCounts] = useState({ upvotes, downvotes });

  const handleVote = (value: 1 | -1) => {
    if (!isSignedIn || !userId) return;

    const previousVote = vote;
    const previousCounts = counts;

    // Update the UI immediately -- the write happens in the background,
    // so a vote feels instant instead of waiting on a network round-trip.
    if (previousVote === value) {
      setVote(null);
      setCounts((current) => ({
        upvotes: current.upvotes - (value === 1 ? 1 : 0),
        downvotes: current.downvotes - (value === -1 ? 1 : 0),
      }));
    } else {
      setVote(value);
      setCounts((current) => ({
        upvotes:
          current.upvotes + (value === 1 ? 1 : 0) - (previousVote === 1 ? 1 : 0),
        downvotes:
          current.downvotes +
          (value === -1 ? 1 : 0) -
          (previousVote === -1 ? 1 : 0),
      }));
    }

    const supabase = createClient();
    const writeVote =
      previousVote === value
        ? supabase
            .from("votes")
            .delete()
            .eq("generation_id", generationId)
            .eq("user_id", userId)
        : supabase.from("votes").upsert(
            { generation_id: generationId, user_id: userId, value },
            { onConflict: "generation_id,user_id" }
          );

    writeVote.then(({ error }) => {
      if (error) {
        // Roll back the optimistic update if the write actually failed.
        setVote(previousVote);
        setCounts(previousCounts);
      }
    });
  };

  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      <button
        onClick={() => handleVote(1)}
        disabled={!isSignedIn}
        className={`rounded-full border px-3 py-1 transition-colors disabled:opacity-40 ${
          vote === 1
            ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        ▲ {counts.upvotes}
      </button>
      <button
        onClick={() => handleVote(-1)}
        disabled={!isSignedIn}
        className={`rounded-full border px-3 py-1 transition-colors disabled:opacity-40 ${
          vote === -1
            ? "border-red-600 bg-red-50 text-red-700 dark:bg-red-950"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        ▼ {counts.downvotes}
      </button>
      {!isSignedIn && (
        <span className="text-xs text-zinc-400">Sign in to vote</span>
      )}
    </div>
  );
}
