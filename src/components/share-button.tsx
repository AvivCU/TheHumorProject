"use client";

import { useState } from "react";

// Send a caption to friends: the phone's share sheet, or copy to clipboard.
export default function ShareButton({ caption }: { caption: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = `“${caption}” — via CUmor`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: window.location.origin });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The user closed the share sheet; nothing to do.
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {copied ? "Copied!" : "↗ Share"}
    </button>
  );
}
