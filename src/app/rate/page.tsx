import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCaptions } from "@/lib/captions";
import RateDeck from "./rate-deck";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate · CUmor",
  description: "One caption at a time: funny or not? CUmor learns your humor.",
};

export default async function RatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/rate");
  }

  const { captions, myVotes, error } = await loadCaptions(supabase, user.id);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-6 py-10">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Rate</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        One caption at a time. Swipe right or tap 😂 if it&apos;s funny, left or 😐 if
        not. Every rating teaches your For You feed.
      </p>
      {error ? (
        <p className="mt-6 text-sm text-red-600">{error}</p>
      ) : (
        <RateDeck captions={captions} initialVotes={myVotes} userId={user.id} />
      )}
    </main>
  );
}
