"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="mt-6 text-sm font-medium text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-50"
    >
      Sign out
    </button>
  );
}
