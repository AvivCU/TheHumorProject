import { getSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Post = {
  id: number;
  title: string;
  body: string | null;
  created_at: string;
};

export default async function PostsPage() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col px-6 py-16">
        <h1 className="text-2xl font-semibold text-red-600">
          Failed to load posts
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {error.message}
        </p>
      </main>
    );
  }

  const posts = (data ?? []) as Post[];

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        Posts
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Live data fetched from Supabase.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {posts.length === 0 && (
          <li className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            No posts yet.
          </li>
        )}
        {posts.map((post) => (
          <li
            key={post.id}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              {post.title}
            </h2>
            {post.body && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {post.body}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              {new Date(post.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
