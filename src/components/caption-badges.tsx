import { STYLES, TOPICS, isStyle, topicsOf, type Caption } from "@/lib/taste";

// Small tags: the humor style and what the caption is about.
export default function CaptionBadges({ item, max = 2 }: { item: Caption; max?: number }) {
  const topics = topicsOf(`${item.prompt} ${item.caption}`).slice(0, max);
  if (!isStyle(item.style) && topics.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {isStyle(item.style) && (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">
          {STYLES[item.style].emoji} {STYLES[item.style].label}
        </span>
      )}
      {topics.map((key) => (
        <span
          key={key}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {TOPICS[key].emoji} {TOPICS[key].label}
        </span>
      ))}
    </div>
  );
}
