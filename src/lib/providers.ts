import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generationSignal } from './generationContext';

export function redact(value: string): string {
  let result = value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_.-]+/g, '[REDACTED]');
  for (const key of ['DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'GEMINI_API_KEY', 'GAMEFORGE_ACCESS_TOKEN']) {
    const secret = process.env[key];
    if (secret) result = result.split(secret).join('[REDACTED]');
  }
  return result;
}

export function parseModel(value: string) {
  const match = /^(deepseek|qwen)\/([\w./:-]{1,150})$/.exec(value);
  if (!match || match[2].includes('..') || match[2].includes('://')) throw new Error('Unsupported model identifier');
  return { provider: match[1] as 'deepseek' | 'qwen', model: match[2] };
}

export function cleanJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

export function providerConfig(model: string) {
  const parsed = parseModel(model);
  const prefix = parsed.provider.toUpperCase();
  const key = process.env[`${prefix}_API_KEY`];
  if (!key) throw new Error(`${prefix}_API_KEY is not configured`);
  const base = (process.env[`${prefix}_BASE_URL`] || (parsed.provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://dashscope.aliyuncs.com/compatible-mode/v1')).replace(/\/$/, '');
  return { ...parsed, key, base };
}

export function configuredModels() {
  const text = [];
  const image = [];
  if (process.env.QWEN_API_KEY) {
    text.push('qwen/qwen4-max');
    image.push(process.env.GAMEFORGE_IMAGE_MODEL || 'qwen/qwen-image-3.0');
  }
  if (process.env.DEEPSEEK_API_KEY) text.push('deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro');
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    text.push('gemini-3-flash-preview', 'gemini-2.5-flash');
    image.push('gemini-2.5-flash-image');
  }
  return { text, image, defaultText: process.env.GAMEFORGE_TEXT_MODEL || text[0] || 'gemini-3-flash-preview', defaultImage: image[0] || 'gemini-2.5-flash-image' };
}

export async function providerRequest(model: string, endpoint: string, body: object, signal?: AbortSignal) {
  signal=signal||generationSignal();
  signal?.throwIfAborted();
  const config = providerConfig(model);
  const timeout = AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS || 600000));
  const response = await fetch(`${config.base}/${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model: config.model }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    // Only two whitelisted fields; never relay provider headers or a raw body.
    const failure=await response.json().catch(()=>null);
    const detail=failure?.error||failure;
    const code=typeof detail?.code==='string'?detail.code.replace(/[^\w.-]/g,'').slice(0,80):'';
    const message=typeof detail?.message==='string'?redact(detail.message).replace(/\s+/g,' ').slice(0,240):'';
    throw new Error(`${config.provider} request failed (${response.status}${code?', '+code:''})${message?': '+message:'; check model availability and account quota'}`);
  }
  return response.json();
}

export async function complete(opts: { model: string; prompt: string; image?: {mimeType: string; data: string}; signal?: AbortSignal; json?: boolean }) {
  const content = opts.image ? [{ type: 'text', text: opts.prompt }, { type: 'image_url', image_url: { url: `data:${opts.image.mimeType};base64,${opts.image.data}` } }] : opts.prompt;
  // v4-pro has no image input; DeepSeek's vision model is flash (V4.1).
  const model = opts.image && opts.model === 'deepseek/deepseek-v4-pro' ? 'deepseek/deepseek-flash' : opts.model;
  // Thinking is on for every call: planning before writing is most of the quality. Reasoning tokens share
  // max_tokens, so the budget is far above the old 16k (the API allows up to 384K).
  const data = await providerRequest(model, 'chat/completions', {
    messages: [{role: 'user', content}], max_tokens: Number(process.env.GAMEFORGE_MAX_TOKENS || 64000), stream: false,
    ...(opts.json ? {response_format:{type:'json_object'}}:{}),
    ...(model.startsWith('qwen/') ? { enable_thinking: true } : { thinking: { type: 'enabled' }, reasoning_effort: process.env.GAMEFORGE_REASONING_EFFORT || 'high' }),
  }, opts.signal);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('Model output was truncated at max_tokens; raise GAMEFORGE_MAX_TOKENS or simplify the request');
  const answer = choice?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Model returned no text');
  const directory = process.env.GAMEFORGE_DATA_DIR;
  if (directory) {
    await fs.mkdir(directory, {recursive: true});
    await fs.appendFile(path.join(directory, 'provider-usage.jsonl'), JSON.stringify({at: new Date().toISOString(), model, usage: data.usage ?? null, finish: choice?.finish_reason ?? null, cost: null})+'\n');
  }
  return answer.trim();
}
