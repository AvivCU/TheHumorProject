// The picture a caption was written about (if there is one).
export default function CaptionPhoto({
  url,
  tall = false,
}: {
  url: string | null;
  tall?: boolean;
}) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="The photo this caption is about"
      loading="lazy"
      className={`mt-3 w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-900 ${
        tall ? "max-h-96" : "max-h-72"
      }`}
    />
  );
}
