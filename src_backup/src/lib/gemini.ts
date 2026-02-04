import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type InlineImage = { mimeType: string; data: string };

export function getGeminiClient() {
  // IMPORTANT (Next.js/Vercel): do NOT rely on implicit env pickup.
  // In some bundling/runtime setups, the SDK may fall back to Google Auth (ADC)
  // if apiKey is not passed explicitly, causing "Could not load the default credentials".
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY/GOOGLE_API_KEY. Add it to .env.local (dev) or Vercel Environment Variables."
    );
  }
  return new GoogleGenAI({ apiKey });
}

export function textFromResponse(resp: GenerateContentResponse): string {
  // SDK provides a .text() helper in many examples, but we keep a safe fallback.
  // @ts-ignore
  if (typeof resp.text === "function") return resp.text();
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p.text).filter(Boolean).join("\n");
}

export function firstInlineImage(resp: GenerateContentResponse): InlineImage | null {
  for (const c of resp.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      const inline = (p as any).inlineData;
      if (inline?.data && inline?.mimeType?.startsWith("image/")) {
        return { mimeType: inline.mimeType, data: inline.data };
      }
    }
  }
  return null;
}

function formatZodIssues(err: z.ZodError<any>): string {
  return err.issues
    .map((i) => {
      const path = i.path?.length ? i.path.join(".") : "(root)";
      return `${path}: ${i.message}`;
    })
    .join("\n");
}

export async function generateStructured<T extends z.ZodTypeAny>(opts: {
  model: string;
  prompt: string;
  schema: T;
  image?: { mimeType: string; data: string };
}): Promise<z.infer<T>> {
  const ai = getGeminiClient();
  const jsonSchema = zodToJsonSchema(opts.schema, { name: "Response" });

  // Gemini sometimes returns partial/incorrect JSON even in JSON mode.
  // We validate against Zod and, on failure, ask Gemini to repair the JSON.
  const maxAttempts = 3;
  let currentPrompt = `Return ONLY valid JSON that matches the schema. No markdown.\n\n${opts.prompt}`;
  let lastRaw = "";
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const contents = opts.image
      ? [{ role: "user", parts: [{ text: currentPrompt }, { inlineData: opts.image }] }]
      : [{ role: "user", parts: [{ text: currentPrompt }] }];

    try {
      const resp = await ai.models.generateContent({
        model: opts.model,
        contents,
        config: {
          responseMimeType: "application/json",
          // @ts-ignore
          responseJsonSchema: jsonSchema as any,
          // Structured outputs can be large; give the model room.
          // @ts-ignore
          maxOutputTokens: 8192,
        },
      });

      lastRaw = textFromResponse(resp);
      const parsed = JSON.parse(lastRaw);

      const checked = opts.schema.safeParse(parsed);
      if (checked.success) return checked.data;

      const issues = formatZodIssues(checked.error);
      lastErr = checked.error;

      // Build a repair prompt for the next attempt.
      currentPrompt =
        `You returned JSON that FAILED schema validation. Fix it.\n` +
        `Rules: (1) output ONLY JSON (no markdown), (2) keep existing values when possible, (3) fill ALL required fields, (4) do not use undefined.\n\n` +
        `Validation issues:\n${issues}\n\n` +
        `Original JSON:\n${JSON.stringify(parsed, null, 2)}\n\n` +
        `Return corrected JSON now.`;
    } catch (e) {
      lastErr = e;
      // If JSON parse fails or the request errors, try one repair-style retry.
      currentPrompt =
        `Return ONLY valid JSON that matches the schema. No markdown.\n` +
        `The previous response was not valid JSON.\n\n` +
        `Previous response (for reference):\n${lastRaw?.slice(0, 4000) || "(empty)"}\n\n` +
        `Now produce a complete JSON object that matches the schema.`;
    }
  }

  // If we get here, we failed all attempts.
  if (lastErr) throw lastErr;
  throw new Error("Failed to generate structured JSON");
}

export async function generateImage(opts: {
  model: string;
  prompt: string;
}): Promise<InlineImage> {
  const ai = getGeminiClient();
  const resp = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    // Important: request IMAGE modality, otherwise the model may return only TEXT.
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });
  const img = firstInlineImage(resp);
  if (!img) {
    throw new Error("No image data returned by Gemini");
  }
  return img;
}

export async function generateText(opts: {
  model: string;
  prompt: string;
}): Promise<string> {
  const ai = getGeminiClient();
  const resp = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: {
      // Give space for HTML output or longer text.
      // @ts-ignore
      maxOutputTokens: 8192,
    },
  });
  return textFromResponse(resp).trim();
}
