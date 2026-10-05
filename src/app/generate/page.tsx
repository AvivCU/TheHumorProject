import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GenerateForm from "./generate-form";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/generate");
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        Generate a caption
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Describe a situation and get a short, AI-written caption. Posted
        generations show up in the feed for everyone to vote on.
      </p>
      <GenerateForm />
    </main>
  );
}
