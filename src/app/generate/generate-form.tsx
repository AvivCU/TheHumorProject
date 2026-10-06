"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;
const RETRY_STATUS_MESSAGES = [
  "The model is busy -- trying again...",
  "Still busy. Please give it one more moment...",
];

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function GenerateForm() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{ caption: string } | null>(null);

  const attemptGenerate = async (
    attempt: number,
    currentPrompt: string
  ): Promise<void> => {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: currentPrompt }),
    });

    const data = await response.json();

    if (response.ok) {
      setResult({ caption: data.generation.caption });
      setPrompt("");
      setIsLoading(false);
      setStatusMessage("");
      return;
    }

    if (data.retryable && attempt < MAX_ATTEMPTS) {
      setStatusMessage(RETRY_STATUS_MESSAGES[attempt - 1] ?? "Trying again...");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return attemptGenerate(attempt + 1, currentPrompt);
    }

    setIsLoading(false);
    setStatusMessage("");
    setErrorMessage(
      data.retryable ? "Third time lucky?" : data.error || "Something went wrong."
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage("");
    setStatusMessage("Generating...");
    setResult(null);

    await attemptGenerate(1, prompt);
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
        disabled={isLoading || !prompt.trim()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isLoading && <Spinner />}
        {isLoading ? statusMessage || "Generating..." : "Generate caption"}
      </button>

      {!isLoading && errorMessage && (
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
