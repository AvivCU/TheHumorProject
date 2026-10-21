import type { SupabaseClient } from "@supabase/supabase-js";

type MixRow = { chain_id: number; weight: number };

type StepRow = {
  id: number;
  step_order: number;
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

export type ChainResult =
  | { ok: true; caption: string; requestId: number }
  | { ok: false; error: string; retryable: boolean; requestId: number | null };

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

function cleanCaption(text: string) {
  return text.trim().replace(/^["“']+|["”']+$/g, "").trim();
}

async function callGemini(
  modelIdentifier: string,
  temperature: number,
  prompt: string
): Promise<ModelCall> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelIdentifier}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: Number(temperature) },
      }),
    }
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      status: response.status,
      text: null,
      error:
        body?.error?.message || `Generation failed (${response.status}).`,
    };
  }

  const parts: { text?: string }[] =
    body?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return text
    ? { status: response.status, text, error: null }
    : {
        status: response.status,
        text: null,
        error: "The model didn't return any text.",
      };
}

async function callModel(
  providerName: string,
  modelIdentifier: string,
  temperature: number,
  prompt: string
): Promise<ModelCall> {
  if (providerName.trim().toLowerCase() === "google") {
    return callGemini(modelIdentifier, temperature, prompt);
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
  return rows
    .map((row) => `- About "${row.prompt}": ${row.caption}`)
    .join("\n");
}

export async function runPromptChain(
  supabase: SupabaseClient,
  userId: string,
  input: string
): Promise<ChainResult> {
  const [mixResult, termsResult, examplesResult] = await Promise.all([
    supabase
      .from("prompt_chain_mix")
      .select("chain_id, weight")
      .eq("is_active", true),
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
    .insert({ user_id: userId, chain_id: chosen.chain_id, prompt: input })
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
      "id, step_order, prompt_template, llm_models(id, model_identifier, temperature, is_active, llm_providers(name))"
    )
    .eq("chain_id", chosen.chain_id)
    .order("step_order");

  if (stepsError) return fail(stepsError.message, false);

  const steps = (stepData ?? []) as unknown as StepRow[];
  if (steps.length === 0) {
    return fail("The selected prompt chain has no steps.", false);
  }

  const baseVars = {
    input,
    terms: formatTerms(termsResult.data ?? []),
    examples: formatExamples(examplesResult.data ?? []),
  };

  let previous = "";

  for (const step of steps) {
    const model = step.llm_models;
    if (!model || !model.is_active || !model.llm_providers) {
      return fail(`The model for step ${step.step_order} is missing or inactive.`, false);
    }

    const prompt = renderTemplate(step.prompt_template, { ...baseVars, previous });
    const startedAt = Date.now();
    const result = await callModel(
      model.llm_providers.name,
      model.model_identifier,
      model.temperature,
      prompt
    );

    const { error: logError } = await supabase.from("llm_responses").insert({
      request_id: requestId,
      step_id: step.id,
      llm_model_id: model.id,
      step_order: step.step_order,
      input_text: prompt,
      output_text: result.text ?? result.error,
      http_status: result.status,
      latency_ms: Date.now() - startedAt,
    });
    if (logError) console.error("Failed to log LLM response:", logError.message);

    if (result.text === null) {
      return fail(
        result.error ?? "Generation failed.",
        result.status === 503 || result.status === 429
      );
    }

    previous = result.text;
  }

  const caption = cleanCaption(previous);
  if (!caption) return fail("The model didn't return any text.", false);

  return { ok: true, caption, requestId };
}
