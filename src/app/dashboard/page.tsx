import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Signed in as {user.email}. This page only renders for logged-in
        users -- the middleware redirects anyone else to /login.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link
          href="/generate"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          Generate a caption
        </Link>
        <Link
          href="/feed"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          Browse the feed
        </Link>
        <Link
          href="/profile"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
        >
          Edit your profile
        </Link>
      </div>
      <SignOutButton />
    </main>
  );
}
