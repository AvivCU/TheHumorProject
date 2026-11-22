import { humorProfile, type Taste } from "@/lib/taste";

const MIN_VOTES = 3;

// "Your humor": what your votes say about you.
export default function HumorProfileCard({ taste }: { taste: Taste }) {
  const profile = humorProfile(taste);
  const laughPercent = taste.votes ? Math.round((taste.laughs / taste.votes) * 100) : 0;

  return (
    <section
      aria-labelledby="humor-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2
        id="humor-heading"
        className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
      >
        Your humor profile
      </h2>
      {taste.votes < MIN_VOTES ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Rate {MIN_VOTES - taste.votes} more caption{MIN_VOTES - taste.votes === 1 ? "" : "s"}{" "}
          and CUmor will show what makes you laugh.
        </p>
      ) : (
        <>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {profile.headline ?? "Keep rating — your taste is still taking shape."}
          </p>
          {profile.loves.length > 0 && (
            <TraitRow title="You laugh at" traits={profile.loves} tone="love" />
          )}
          {profile.passes.length > 0 && (
            <TraitRow title="Not your thing" traits={profile.passes} tone="pass" />
          )}
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Based on {taste.votes} rating{taste.votes === 1 ? "" : "s"} · you laughed at{" "}
            {laughPercent}%
          </p>
        </>
      )}
    </section>
  );
}

function TraitRow({
  title,
  traits,
  tone,
}: {
  title: string;
  traits: { key: string; text: string; detail: string }[];
  tone: "love" | "pass";
}) {
  return (
    <div className="mt-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {traits.map((trait) => (
          <li
            key={trait.key}
            title={trait.detail}
            className={`rounded-full px-2.5 py-1 text-sm ${
              tone === "love"
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
            }`}
          >
            {trait.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
