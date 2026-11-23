"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { STYLES, STYLE_KEYS, type StyleKey } from "@/lib/taste";
import { IMAGE_BUCKET } from "@/lib/caption-image";
import { resizeImage, type ResizedImage } from "@/lib/resize-image";
import { createClient } from "@/lib/supabase/client";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;
const RETRY_STATUS_MESSAGES = [
  "The model is busy -- trying again...",
  "Still busy. Please give it one more moment...",
];

// One tap fills in a classic Columbia situation.
const IDEAS = [
  { label: "📚 Butler at 2am", text: "Every seat in Butler is taken at 2am during finals" },
  { label: "🍕 John Jay dining", text: "John Jay dining ran out of the only good food again" },
  { label: "🚇 The 1 train", text: "The 1 train skipped 116th Street again" },
  { label: "🏛️ Low Steps", text: "Sitting on Low Steps pretending it isn't freezing" },
  { label: "🎓 Lit Hum", text: "Pretending I did the Lit Hum reading in seminar" },
  { label: "🛏️ Roommate", text: "My roommate's alarm went off 9 times this morning" },
];

type Option = { requestId: number; caption: string };

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition-colors ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
  }`;

export default function GenerateForm() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<StyleKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState<{
    id: number;
    caption: string;
    imageUrl: string | null;
  } | null>(null);
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const [photo, setPhoto] = useState<ResizedImage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setErrorMessage("");
    try {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(await resizeImage(file));
      setOptions([]);
      setPicked(null);
    } catch {
      setErrorMessage("That photo couldn't be read. Try a JPG, PNG or WebP.");
    }
  };

  const removePhoto = () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setOptions([]);
    setPicked(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const attemptGenerate = async (attempt: number, currentPrompt: string): Promise<void> => {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: currentPrompt,
        style,
        count: 3,
        image: photo ? { mimeType: "image/jpeg", base64: photo.base64 } : null,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      setOptions(data.options);
      setPicked(data.options[0]?.requestId ?? null);
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
    setErrorMessage(data.retryable ? "Third time lucky?" : data.error || "Something went wrong.");
  };

  const generate = async () => {
    if ((!prompt.trim() && !photo) || isLoading) return;
    setIsLoading(true);
    setErrorMessage("");
    setStatusMessage("Writing 3 options...");
    setOptions([]);
    setPicked(null);
    setPosted(null);
    setMilestoneCount(null);
    await attemptGenerate(1, prompt);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void generate();
  };

  const postPicked = async () => {
    if (picked === null || isPosting) return;
    setIsPosting(true);
    setErrorMessage("");

    // Upload the photo to the user's own folder first; the server checks
    // the address before saving it with the caption.
    let imageUrl: string | null = null;
    if (photo) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, photo.blob, { contentType: "image/jpeg" });
        if (uploadError) {
          setIsPosting(false);
          setErrorMessage(`The photo didn't upload: ${uploadError.message}`);
          return;
        }
        imageUrl = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      }
    }

    const response = await fetch("/api/generate/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: picked, imageUrl }),
    });
    const data = await response.json();
    setIsPosting(false);
    if (!response.ok) {
      setErrorMessage(data.error || "Could not post the caption.");
      return;
    }
    setPosted({
      id: data.generation.id,
      caption: data.generation.caption,
      imageUrl: data.generation.image_url ?? null,
    });
    setMilestoneCount(data.milestoneCount ?? null);
    setOptions([]);
    setPrompt("");
    removePhoto();
  };

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            1. Pick a humor style
          </legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStyle(null)} className={chip(style === null)}>
              🎲 Surprise me
            </button>
            {STYLE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={style === key}
                onClick={() => setStyle(key)}
                className={chip(style === key)}
              >
                {STYLES[key].emoji} {STYLES[key].label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            2. Add a photo <span className="font-normal text-zinc-500">(optional)</span>
          </p>
          <input
            ref={fileInput}
            id="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
          />
          {photo ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt="Your photo"
                className="h-28 w-28 rounded-lg object-cover"
              />
              <div className="flex flex-col items-start gap-2 text-sm">
                <p className="text-zinc-600 dark:text-zinc-400">
                  The AI will look at this photo and write captions about it.
                </p>
                <button
                  type="button"
                  onClick={removePhoto}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
                >
                  Remove photo
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="photo"
              className="flex h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              📷 Choose a photo
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="situation" className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            3. {photo ? "Anything to add?" : "What's the situation?"}
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Ideas">
            {IDEAS.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => setPrompt(idea.text)}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {idea.label}
              </button>
            ))}
          </div>
          <textarea
            id="situation"
            className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            value={prompt}
            maxLength={300}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Waiting in the Butler Library line at 1am before finals"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || (!prompt.trim() && !photo)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isLoading && <Spinner />}
          {isLoading ? statusMessage || "Writing 3 options..." : "Write 3 captions"}
        </button>
      </form>

      {!isLoading && errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {options.length > 0 && (
        <section aria-labelledby="options-heading" className="flex flex-col gap-3">
          <h2 id="options-heading" className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            4. Pick your favorite
          </h2>
          <div role="radiogroup" className="flex flex-col gap-2">
            {options.map((option, index) => (
              <button
                key={option.requestId}
                type="button"
                role="radio"
                aria-checked={picked === option.requestId}
                onClick={() => setPicked(option.requestId)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  picked === option.requestId
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    picked === option.requestId
                      ? "border-zinc-900 dark:border-zinc-50"
                      : "border-zinc-400"
                  }`}
                >
                  {picked === option.requestId && (
                    <span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-50" />
                  )}
                </span>
                <span className="text-base text-zinc-900 dark:text-zinc-50">
                  <span className="sr-only">Option {index + 1}: </span>
                  {option.caption}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={postPicked}
              disabled={picked === null || isPosting}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background disabled:opacity-50"
            >
              {isPosting && <Spinner />}
              Post this one
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={isLoading}
              className="h-11 flex-1 rounded-full border border-zinc-300 px-5 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Try 3 more
            </button>
          </div>
        </section>
      )}

      {milestoneCount && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="animate-bounce text-2xl" aria-hidden="true">
            🎉
          </span>
          <p className="font-medium">
            Milestone! That&apos;s your {milestoneCount}
            {milestoneCount === 1 ? "st" : "th"} caption.
          </p>
        </div>
      )}

      {posted && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          {posted.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posted.imageUrl}
              alt=""
              className="mb-3 max-h-56 w-full rounded-lg object-cover"
            />
          )}
          <p className="font-medium">Posted to the feed:</p>
          <p className="mt-1">&ldquo;{posted.caption}&rdquo;</p>
          <p className="mt-3 flex flex-wrap gap-4">
            <Link href="/feed?sort=new" className="font-medium underline">
              See it in the feed
            </Link>
            <Link href="/rate" className="font-medium underline">
              Rate other captions
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
