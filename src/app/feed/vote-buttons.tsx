"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  generationId: number;
  upvotes: number;
  downvotes: number;
  initialVote: 1 | -1 | null;
  isSignedIn: boolean;
};

export default function VoteButtons({
  generationId,
  upvotes,
  downvotes,
  initialVote,
  isSignedIn,
}: Props) {
  const router = useRouter();
  const [vote, setVote] = useState(initialVote);
  const [counts, setCounts] = useState({ upvotes, downvotes });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVote = async (value: 1 | -1) => {
    if (!isSignedIn || isSubmitting) return;
    setIsSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsSubmitting(false);
      return;
    }

    if (vote === value) {
      // Clicking the same button again retracts the vote.
      await supabase
        .from("votes")
        .delete()
        .eq("generation_id", generationId)
        .eq("user_id", user.id);
      setVote(null);
      setCounts((current) => ({
        upvotes: current.upvotes - (value === 1 ? 1 : 0),
        downvotes: current.downvotes - (value === -1 ? 1 : 0),
      }));
    } else {
      await supabase.from("votes").upsert(
        {
          generation_id: generationId,
          user_id: user.id,
          value,
        },
        { onConflict: "generation_id,user_id" }
      );

      setCounts((current) => ({
        upvotes:
          current.upvotes + (value === 1 ? 1 : 0) - (vote === 1 ? 1 : 0),
        downvotes:
          current.downvotes + (value === -1 ? 1 : 0) - (vote === -1 ? 1 : 0),
      }));
      setVote(value);
    }

    setIsSubmitting(false);
    router.refresh();
  };

  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      <button
        onClick={() => handleVote(1)}
        disabled={!isSignedIn || isSubmitting}
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
        disabled={!isSignedIn || isSubmitting}
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
