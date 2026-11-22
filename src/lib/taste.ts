// How CUmor learns your sense of humor from your votes.
// No imports, so it can be unit-tested directly with Node.

export type StyleKey =
  | "relatable"
  | "sarcastic"
  | "punny"
  | "wholesome"
  | "absurd"
  | "dramatic";

export const STYLES: Record<
  StyleKey,
  { emoji: string; label: string; instruction: string }
> = {
  relatable: {
    emoji: "😩",
    label: "Relatable",
    instruction: "painfully relatable, like a text you'd send the group chat",
  },
  sarcastic: {
    emoji: "🙄",
    label: "Sarcastic",
    instruction: "dry and sarcastic, with an eye-roll",
  },
  punny: {
    emoji: "🥁",
    label: "Punny",
    instruction: "built around a clever pun or wordplay",
  },
  wholesome: {
    emoji: "🥹",
    label: "Wholesome",
    instruction: "warm and wholesome, funny without being mean",
  },
  absurd: {
    emoji: "🤪",
    label: "Absurd",
    instruction: "absurd and surreal, wildly exaggerated",
  },
  dramatic: {
    emoji: "🎭",
    label: "Dramatic",
    instruction: "melodramatic, overreacting like it's the end of the world",
  },
};

export const STYLE_KEYS = Object.keys(STYLES) as StyleKey[];

export function isStyle(value: unknown): value is StyleKey {
  return typeof value === "string" && value in STYLES;
}

// The style is added to what the AI sees, after the situation.
const STYLE_MARKER = "\n\nHumor style: ";

export function withStyle(situation: string, style: StyleKey | null): string {
  if (!style) return situation;
  return `${situation}${STYLE_MARKER}${STYLES[style].label} (${STYLES[style].instruction}).`;
}

// Undo withStyle: get the situation and style back from a saved request.
export function splitStyledPrompt(input: string): {
  situation: string;
  style: StyleKey | null;
} {
  const index = input.indexOf(STYLE_MARKER);
  if (index < 0) return { situation: input.trim(), style: null };
  const label = input.slice(index + STYLE_MARKER.length).split(" (")[0];
  const style = STYLE_KEYS.find((key) => STYLES[key].label === label) ?? null;
  return { situation: input.slice(0, index).trim(), style };
}

export type TopicKey =
  | "butler"
  | "food"
  | "exams"
  | "classes"
  | "dorms"
  | "campus"
  | "nyc"
  | "weather"
  | "social";

export const TOPICS: Record<TopicKey, { emoji: string; label: string; pattern: RegExp }> = {
  butler: { emoji: "📚", label: "Butler & libraries", pattern: /\bbutler\b|\blibrar|\bstacks\b/i },
  food: {
    emoji: "🍕",
    label: "Dining & food",
    pattern:
      /\bjohn jay dining\b|\bjjs\b|\bferris\b|\bdining\b|\bfood\b|\bcoffee\b|\bcaf[eé]\b|\bhewitt\b|\blunch\b|\bdinner\b|\bbreakfast\b|\bpizza\b|\bsnack/i,
  },
  exams: {
    emoji: "📝",
    label: "Exams & studying",
    pattern: /\bfinals?\b|\bmidterms?\b|\bexams?\b|\bquiz|\bgrades?\b|\bgpa\b|\bstudy|\ball-?nighter/i,
  },
  classes: {
    emoji: "🎓",
    label: "Classes & the Core",
    pattern:
      /\bclass(es)?\b|\blectures?\b|\bprofessors?\b|\bprof\b|\bseminar|\bthe core\b|\blit hum\b|\bhomework\b|\bpsets?\b|\bessays?\b|\boffice hours\b/i,
  },
  dorms: {
    emoji: "🛏️",
    label: "Dorm life",
    pattern: /\bdorms?\b|\broommates?\b|\bcarman\b|\bwien\b|\beast campus\b|\blaundry\b|\bsuite\b/i,
  },
  campus: {
    emoji: "🏛️",
    label: "Around campus",
    pattern: /\blow steps\b|\blerner\b|\bcollege walk\b|\bcampus\b|\balma\b|\bquad\b|\bgates?\b/i,
  },
  nyc: {
    emoji: "🚇",
    label: "NYC life",
    pattern: /\bsubway\b|\b1 train\b|\bmta\b|\bharlem\b|\bnyc\b|\bnew york\b|\bbroadway\b|\bmanhattan\b/i,
  },
  weather: {
    emoji: "🌧️",
    label: "Weather",
    pattern: /\brain|\bsnow|\bcold\b|\bfreezing\b|\bheat\b|\bweather\b|\bwind/i,
  },
  social: {
    emoji: "🎉",
    label: "Social life",
    pattern: /\bpart(y|ies)\b|\bfrat\b|\bdates?\b|\bcrush\b|\bgroup chat\b|\bhinge\b|\bclubs?\b/i,
  },
};

export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];

export function isTopic(value: unknown): value is TopicKey {
  return typeof value === "string" && value in TOPICS;
}

export function topicsOf(text: string): TopicKey[] {
  return TOPIC_KEYS.filter((key) => TOPICS[key].pattern.test(text));
}

export type Caption = {
  id: number;
  prompt: string;
  caption: string;
  style: string | null;
  upvotes: number;
  downvotes: number;
  created_at: string;
};

type Tally = { liked: number; passed: number; score: number };

export type Taste = {
  styles: Partial<Record<StyleKey, Tally>>;
  topics: Partial<Record<TopicKey, Tally>>;
  votes: number;
  laughs: number;
};

const score = (liked: number, passed: number) => (liked - passed) / (liked + passed + 2);

// Your votes -> how much you like each style and topic (-1 .. 1).
export function buildTaste(
  captions: Caption[],
  myVotes: Record<number, 1 | -1>
): Taste {
  const styles: Taste["styles"] = {};
  const topics: Taste["topics"] = {};
  let votes = 0;
  let laughs = 0;
  const add = <K extends string>(bucket: Partial<Record<K, Tally>>, key: K, value: 1 | -1) => {
    const tally = bucket[key] ?? { liked: 0, passed: 0, score: 0 };
    if (value === 1) tally.liked += 1;
    else tally.passed += 1;
    tally.score = score(tally.liked, tally.passed);
    bucket[key] = tally;
  };
  for (const item of captions) {
    const value = myVotes[item.id];
    if (!value) continue;
    votes += 1;
    if (value === 1) laughs += 1;
    if (isStyle(item.style)) add(styles, item.style, value);
    for (const topic of topicsOf(`${item.prompt} ${item.caption}`)) add(topics, topic, value);
  }
  return { styles, topics, votes, laughs };
}

export function laughRate(item: Pick<Caption, "upvotes" | "downvotes">): number | null {
  const total = item.upvotes + item.downvotes;
  return total === 0 ? null : item.upvotes / total;
}

// How likely you are to laugh at a caption: your taste first, then what
// everyone else thought, then a little boost for new captions.
export function forYouScore(item: Caption, taste: Taste, now = Date.now()): number {
  const net = item.upvotes - item.downvotes;
  const popularity = net / (item.upvotes + item.downvotes + 3);
  const styleScore = isStyle(item.style) ? taste.styles[item.style]?.score ?? 0 : 0;
  const topicScores = topicsOf(`${item.prompt} ${item.caption}`).map(
    (key) => taste.topics[key]?.score ?? 0
  );
  const topicScore = topicScores.length ? Math.max(...topicScores) : 0;
  const ageDays = Math.max(0, (now - new Date(item.created_at).getTime()) / 86_400_000);
  const freshness = Math.exp(-ageDays / 14);
  return 1.2 * (styleScore + topicScore) + 0.6 * popularity + 0.3 * freshness;
}

export function rankForYou<T extends Caption>(items: T[], taste: Taste, now = Date.now()): T[] {
  return [...items]
    .map((item) => ({ item, s: forYouScore(item, taste, now) }))
    .sort((a, b) => b.s - a.s || b.item.id - a.item.id)
    .map(({ item }) => item);
}

const strong = (tally: Tally | undefined) => !!tally && tally.score >= 0.25 && tally.liked >= 2;

// One short line: why this caption is in your feed.
export function reasonFor(item: Caption, taste: Taste): string | null {
  const styleTally = isStyle(item.style) ? taste.styles[item.style] : undefined;
  const topic = topicsOf(`${item.prompt} ${item.caption}`)
    .filter((key) => strong(taste.topics[key]))
    .sort((a, b) => (taste.topics[b]!.score ?? 0) - (taste.topics[a]!.score ?? 0))[0];
  if (strong(styleTally) && isStyle(item.style)) {
    const style = STYLES[item.style];
    return topic
      ? `Because you laugh at ${style.label.toLowerCase()} captions about ${TOPICS[topic].label}`
      : `Because you laugh at ${style.emoji} ${style.label.toLowerCase()} captions`;
  }
  if (topic) return `Because you like captions about ${TOPICS[topic].emoji} ${TOPICS[topic].label}`;
  const rate = laughRate(item);
  if (rate !== null && rate >= 0.7 && item.upvotes >= 3) {
    return `Crowd favorite: ${Math.round(rate * 100)}% laughed`;
  }
  return null;
}

export type ProfileTrait = { key: string; text: string; detail: string };

// "You laugh most at sarcastic captions about Butler & libraries."
export function humorProfile(taste: Taste): {
  headline: string | null;
  loves: ProfileTrait[];
  passes: ProfileTrait[];
} {
  const entries = [
    ...STYLE_KEYS.flatMap((key) => {
      const tally = taste.styles[key];
      return tally
        ? [{ kind: "style" as const, key, tally, text: `${STYLES[key].emoji} ${STYLES[key].label}` }]
        : [];
    }),
    ...TOPIC_KEYS.flatMap((key) => {
      const tally = taste.topics[key];
      return tally
        ? [{ kind: "topic" as const, key, tally, text: `${TOPICS[key].emoji} ${TOPICS[key].label}` }]
        : [];
    }),
  ];
  const toTrait = (entry: (typeof entries)[number]): ProfileTrait => ({
    key: `${entry.kind}-${entry.key}`,
    text: entry.text,
    detail: `laughed ${entry.tally.liked}× · passed ${entry.tally.passed}×`,
  });
  const loves = entries
    .filter((entry) => strong(entry.tally))
    .sort((a, b) => b.tally.score - a.tally.score);
  const passes = entries
    .filter((entry) => entry.tally.score <= -0.25 && entry.tally.passed >= 2)
    .sort((a, b) => a.tally.score - b.tally.score);

  const topStyle = loves.find((entry) => entry.kind === "style");
  const topTopic = loves.find((entry) => entry.kind === "topic");
  let headline: string | null = null;
  if (topStyle && topTopic) {
    headline = `You laugh most at ${STYLES[topStyle.key as StyleKey].label.toLowerCase()} captions about ${TOPICS[topTopic.key as TopicKey].label}.`;
  } else if (topStyle) {
    headline = `You laugh most at ${STYLES[topStyle.key as StyleKey].label.toLowerCase()} captions.`;
  } else if (topTopic) {
    headline = `You laugh most at captions about ${TOPICS[topTopic.key as TopicKey].label}.`;
  }
  return {
    headline,
    loves: loves.slice(0, 5).map(toTrait),
    passes: passes.slice(0, 4).map(toTrait),
  };
}
