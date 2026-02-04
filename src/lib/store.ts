import { promises as fs } from "fs";
import path from "path";

export type GameMode = "text-adventure" | "side-scroller";
export type GameStatus = "draft" | "ready";

export type GameRecord = {
  id: string;
  mode: GameMode;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  language: "zh" | "en";
  textModel: string;
  imageModel: string;
  outline?: any;
  scenes?: any;
  plan?: any;
  images?: {
    cover?: string;
    scenes?: Record<string, string>;
    assets?: Record<string, string>;
  };
  assetMeta?: Record<string, { type: string; needsCutout: boolean; file: string }>;
  gameHtml?: string;
  warnings?: string[];
  metrics?: Record<string, { startedAt: string; endedAt?: string; durationMs?: number }>;
};

// In Vercel Serverless Functions, process.cwd() points to /var/task (read-only).
// The only writable directory is /tmp (temporary, may be cleared on cold start).
const baseDir = process.env.VERCEL ? "/tmp/gameforge-data" : path.join(process.cwd(), ".gameforge-data");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function recordPath(id: string) {
  return path.join(baseDir, id, "record.json");
}

function assetDir(id: string) {
  return path.join(baseDir, id, "assets");
}

export async function createGameRecord(input: {
  mode: GameMode;
  prompt: string;
  language: "zh" | "en";
  textModel: string;
  imageModel: string;
}) {
  const id = Math.random().toString(36).slice(2, 10);
  const now = new Date().toISOString();
  const record: GameRecord = {
    id,
    mode: input.mode,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    prompt: input.prompt,
    language: input.language,
    textModel: input.textModel,
    imageModel: input.imageModel,
  };
  await ensureDir(path.join(baseDir, id));
  await ensureDir(assetDir(id));
  await fs.writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

export async function loadGameRecord(id: string): Promise<GameRecord | null> {
  try {
    const text = await fs.readFile(recordPath(id), "utf-8");
    return JSON.parse(text) as GameRecord;
  } catch {
    return null;
  }
}

export async function saveGameRecord(id: string, patch: Partial<GameRecord>) {
  const current = (await loadGameRecord(id)) ?? null;
  if (!current) return null;
  const next: GameRecord = {
    ...current,
    ...patch,
    id: current.id,
    mode: current.mode,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(recordPath(id), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export async function listGames(): Promise<GameRecord[]> {
  try {
    await ensureDir(baseDir);
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const records: GameRecord[] = [];
    for (const id of ids) {
      const record = await loadGameRecord(id);
      if (record) records.push(record);
    }
    return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveAssetFile(id: string, filename: string, buffer: Buffer) {
  await ensureDir(assetDir(id));
  const filePath = path.join(assetDir(id), filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function readAssetFile(id: string, filename: string) {
  const filePath = path.join(assetDir(id), filename);
  return fs.readFile(filePath);
}

export function getAssetFilePath(id: string, filename: string) {
  return path.join(assetDir(id), filename);
}

export async function deleteGameRecord(id: string) {
  try {
    await fs.rm(path.join(baseDir, id), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
