"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function GenerateForm() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{ caption: string } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus("error");
      setErrorMessage(data.error || "Something went wrong.");
      return;
    }

    setStatus("idle");
    setResult({ caption: data.generation.caption });
    setPrompt("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        What&apos;s the situation?
        <textarea
          className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Waiting in the Butler Library line at 1am before finals"
        />
      </label>

      <button
        type="submit"
        disabled={status === "loading" || !prompt.trim()}
        className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {status === "loading" ? "Generating..." : "Generate caption"}
      </button>

      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {result && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <p className="font-medium">Posted to the feed:</p>
          <p className="mt-1">&ldquo;{result.caption}&rdquo;</p>
        </div>
      )}

      <Link
        href="/feed"
        className="text-center text-sm font-medium text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-50"
      >
        View the feed
      </Link>
    </form>
  );
}
