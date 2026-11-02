import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by CUmor (src/lib/prompt-chain.ts) and the Prompt Chain Tool
// (src/lib/prompt-chain.ts): keep the two copies identical.

type MixRow = { chain_id: number; weight: number };

type StepRow = {
  id: number;
  step_order: number;
  title: string | null;
  include_image: boolean;
  prompt_template: string;
  llm_models: {
    id: number;
    model_identifier: string;
    temperature: number;
    is_active: boolean;
    llm_providers: { name: string } | null;
  } | null;
};

type ModelCall = {
  status: number;
  text: string | null;
  error: string | null;
};

export type ChainImage = { mimeType: string; base64: string };

export type ChainEvent =
  | {
      type: "start";
      requestId: number;
      chainId: number;
      steps: { order: number; title: string | null }[];
    }
  | {
      type: "step";
      order: number;
      ok: boolean;
      output: string;
      latencyMs: number;
    };

export type ChainResult =
  | { ok: true; output: string; caption: string; requestId: number }
  | { ok: false; error: string; retryable: boolean; requestId: number | null };

export type RunOptions = {
  // Run this chain directly instead of picking one from the mix.
  chainId?: number;
  image?: ChainImage | null;
  imageUrl?: string | null;
  source?: "app" | "tool";
  // Mark the request completed as soon as the chain succeeds. CUmor
  // leaves this off and completes it after saving the caption.
  completeOnSuccess?: boolean;
  onEvent?: (event: ChainEvent) => void;
};

export function pickWeighted<T extends { weight: number }>(
  items: T[],
  random: () => number = Math.random
): T | null {
  const usable = items.filter((item) => Number(item.weight) > 0);
  const total = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  if (total <= 0) return null;

  let threshold = random() * total;
  for (const item of usable) {
    threshold -= Number(item.weight);
    if (threshold < 0) return item;
  }
  return usable[usable.length - 1];
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );
}

export function cleanCaption(text: string) {
  return text.trim().replace(/^["“']+|["”']+$/g, "").trim();
}

// A final output like "1. foo\n2. bar" becomes ["foo", "bar"]; a single
// paragraph stays one caption.
export function splitCaptions(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => cleanCaption(line.replace(/^\s*(?:\d+[.):]|[-*•])\s+/, "")))
    .filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line.length <= 300)) return lines;
  const whole = cleanCaption(text);
  return whole ? [whole] : [];
}

async function callGemini(
  modelIdentifier: string,
  temperature: number,
  prompt: string,
  image: ChainImage | null
): Promise<ModelCall> {
  const parts: object[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelIdentifier}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: Number(temperature) },
      }),
    }
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      status: response.status,
      text: null,
      error: body?.error?.message || `Generation failed (${response.status}).`,
    };
  }

  const responseParts: { text?: string }[] = body?.candidates?.[0]?.content?.parts ?? [];
  const text = responseParts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return text
    ? { status: response.status, text, error: null }
    : { status: response.status, text: null, error: "The model didn't return any text." };
}

async function callModel(
  providerName: string,
  modelIdentifier: string,
  temperature: number,
  prompt: string,
  image: ChainImage | null
): Promise<ModelCall> {
  if (providerName.trim().toLowerCase() === "google") {
    return callGemini(modelIdentifier, temperature, prompt, image);
  }
  return {
    status: 501,
    text: null,
    error: `No integration exists yet for LLM provider "${providerName}".`,
  };
}

function formatTerms(rows: { term: string; definition: string }[]) {
  if (rows.length === 0) return "(none)";
  return rows.map((row) => `- ${row.term}: ${row.definition}`).join("\n");
}

function formatExamples(rows: { prompt: string; caption: string }[]) {
  if (rows.length === 0) return "(none)";
  return rows.map((row) => `- About "${row.prompt}": ${row.caption}`).join("\n");
}

export async function runPromptChain(
  supabase: SupabaseClient,
  userId: string,
  input: string,
  options: RunOptions = {}
): Promise<ChainResult> {
  const { image = null, imageUrl = null, source = "app", onEvent } = options;

  const [mixResult, termsResult, examplesResult] = await Promise.all([
    options.chainId === undefined
      ? supabase.from("prompt_chain_mix").select("chain_id, weight").eq("is_active", true)
      : Promise.resolve({ data: [{ chain_id: options.chainId, weight: 1 }], error: null }),
    supabase.from("terms").select("term, definition").order("term"),
    supabase
      .from("generation_examples")
      .select("prompt, caption")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (mixResult.error) {
    return { ok: false, error: mixResult.error.message, retryable: false, requestId: null };
  }

  const chosen = pickWeighted((mixResult.data ?? []) as MixRow[]);
  if (!chosen) {
    return {
      ok: false,
      error: "No active prompt chain is configured.",
      retryable: false,
      requestId: null,
    };
  }

  const { data: request, error: requestError } = await supabase
    .from("generation_requests")
    .insert({
      user_id: userId,
      chain_id: chosen.chain_id,
      prompt: input,
      source,
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (requestError || !request) {
    return {
      ok: false,
      error: requestError?.message ?? "Could not log the generation request.",
      retryable: false,
      requestId: null,
    };
  }

  const requestId = request.id as number;

  const fail = async (error: string, retryable: boolean): Promise<ChainResult> => {
    await supabase
      .from("generation_requests")
      .update({ status: "failed", error, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    return { ok: false, error, retryable, requestId };
  };

  const { data: stepData, error: stepsError } = await supabase
    .from("prompt_chain_steps")
    .select(
      "id, step_order, title, include_image, prompt_template, llm_models(id, model_identifier, temperature, is_active, llm_providers(name))"
    )
    .eq("chain_id", chosen.chain_id)
    .order("step_order");

  if (stepsError) return fail(stepsError.message, false);

  const steps = (stepData ?? []) as unknown as StepRow[];
  if (steps.length === 0) {
    return fail("The selected prompt chain has no steps.", false);
  }

  onEvent?.({
    type: "start",
    requestId,
    chainId: chosen.chain_id,
    steps: steps.map((step) => ({ order: step.step_order, title: step.title })),
  });

  const vars: Record<string, string> = {
    input: input || "(no text input)",
    terms: formatTerms(termsResult.data ?? []),
    examples: formatExamples(examplesResult.data ?? []),
    previous: "",
  };

  for (const step of steps) {
    const model = step.llm_models;
    if (!model || !model.is_active || !model.llm_providers) {
      const error = `The model for step ${step.step_order} is missing or inactive.`;
      onEvent?.({ type: "step", order: step.step_order, ok: false, output: error, latencyMs: 0 });
      return fail(error, false);
    }

    const prompt = renderTemplate(step.prompt_template, vars);
    const startedAt = Date.now();
    const result = await callModel(
      model.llm_providers.name,
      model.model_identifier,
      model.temperature,
      prompt,
      step.include_image ? image : null
    );
    const latencyMs = Date.now() - startedAt;

    const { error: logError } = await supabase.from("llm_responses").insert({
      request_id: requestId,
      step_id: step.id,
      llm_model_id: model.id,
      step_order: step.step_order,
      input_text: step.include_image && image ? `[image attached]\n${prompt}` : prompt,
      output_text: result.text ?? result.error,
      http_status: result.status,
      latency_ms: latencyMs,
    });
    if (logError) console.error("Failed to log LLM response:", logError.message);

    onEvent?.({
      type: "step",
      order: step.step_order,
      ok: result.text !== null,
      output: result.text ?? result.error ?? "Generation failed.",
      latencyMs,
    });

    if (result.text === null) {
      return fail(
        result.error ?? "Generation failed.",
        result.status === 503 || result.status === 429
      );
    }

    vars.previous = result.text;
    vars[`step_${step.step_order}`] = result.text;
  }

  const output = vars.previous.trim();
  const caption = cleanCaption(output);
  if (!caption) return fail("The model didn't return any text.", false);

  await supabase
    .from("generation_requests")
    .update(
      options.completeOnSuccess
        ? { output, status: "completed", completed_at: new Date().toISOString() }
        : { output }
    )
    .eq("id", requestId);

  return { ok: true, output, caption, requestId };
}
