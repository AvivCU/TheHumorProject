import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        CUmor
      </h1>
      <p className="mt-3 max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        AI-written captions for campus life, rated by real people.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/feed"
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          View Feed
        </Link>
        <Link
          href="/generate"
          className="flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Generate a caption
        </Link>
      </div>

      <Link
        href="/posts"
        className="mt-10 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        View legacy posts demo
      </Link>
    </main>
  );
}
