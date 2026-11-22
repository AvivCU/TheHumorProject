import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";
import ProfileForm from "./profile-form";
import Link from "next/link";
import { loadCaptions } from "@/lib/captions";
import { buildTaste } from "@/lib/taste";
import HumorProfileCard from "@/components/humor-profile-card";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/profile");
  }

  const [{ data: profile }, { captions, myVotes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    loadCaptions(supabase, user.id),
  ]);
  const taste = buildTaste(captions, myVotes);
  const mine = captions.filter((item) => item.creator_id === user.id);
  const laughsReceived = mine.reduce((sum, item) => sum + item.upvotes, 0);
  const best = [...mine].sort((a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes))[0];

  return (
    <main className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        Profile
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {user.email}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Captions posted", value: mine.length },
          { label: "Laughs received", value: laughsReceived },
          { label: "Captions rated", value: taste.votes },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {stat.value}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </div>
      {best && best.upvotes > 0 && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Your best caption: &ldquo;{best.caption}&rdquo; ({best.upvotes} 😂)
        </p>
      )}

      <div className="mt-6">
        <HumorProfileCard taste={taste} />
        <Link href="/rate" className="mt-2 inline-block text-sm underline">
          Rate more captions
        </Link>
      </div>

      <ProfileForm
        userId={user.id}
        initialFirstName={profile?.first_name ?? ""}
        initialLastName={profile?.last_name ?? ""}
        initialAvatarUrl={profile?.avatar_url ?? null}
      />

      <SignOutButton className="mt-6" />
    </main>
  );
}
