import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="whitespace-nowrap text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          😄 CUmor
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-sm sm:gap-4">
          <Link
            href="/feed"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Feed
          </Link>
          {user ? (
            <>
              <Link
                href="/rate"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Rate
              </Link>
              <Link
                href="/generate"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Generate
              </Link>
              <Link
                href="/profile"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Profile
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="font-medium text-zinc-900 dark:text-zinc-50"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
