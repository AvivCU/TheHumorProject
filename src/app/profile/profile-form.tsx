"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  initialAvatarUrl: string | null;
};

export default function ProfileForm({
  userId,
  initialFirstName,
  initialLastName,
  initialAvatarUrl,
}: Props) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const needsInfo = !initialFirstName || !initialLastName;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage("");

    const supabase = createClient();
    let nextAvatarUrl = avatarUrl;

    if (avatarFile) {
      const fileExt = avatarFile.name.split(".").pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) {
        setStatus("error");
        setErrorMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      nextAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName || null,
        last_name: lastName || null,
        avatar_url: nextAvatarUrl,
      })
      .eq("id", userId);

    if (updateError) {
      setStatus("error");
      setErrorMessage(updateError.message);
      return;
    }

    setAvatarUrl(nextAvatarUrl);
    setStatus("saved");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
      {needsInfo && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Welcome! Please add your first and last name to finish setting up
          your profile.
        </p>
      )}

      {avatarUrl && (
        <Image
          src={avatarUrl}
          alt="Profile photo"
          width={96}
          height={96}
          className="h-24 w-24 rounded-full object-cover"
        />
      )}

      <label className="flex flex-col gap-1 text-sm">
        First name
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Last name
        <input
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Profile photo
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <button
        type="submit"
        disabled={status === "saving"}
        className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {status === "saving" ? "Saving..." : "Save profile"}
      </button>

      {status === "saved" && (
        <p className="text-sm text-green-600">Profile saved.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
