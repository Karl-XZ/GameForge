import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { kv } from "@vercel/kv";
import { del as blobDel, head as blobHead, list as blobList, put as blobPut } from "@vercel/blob";

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

const isVercel = !!process.env.VERCEL;
const hasKv = (!!process.env.KV_URL || !!process.env.KV_REST_API_URL) && !!process.env.KV_REST_API_TOKEN;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const useRemoteStorage = hasKv && hasBlob;

// Local filesystem fallback for dev/test only.
// On Vercel, KV + Blob is required to avoid /tmp persistence issues.
const baseDir =
  process.env.GAMEFORGE_DATA_DIR ??
  (isVercel
    ? "/tmp/gameforge-data"
    : path.join(os.tmpdir(), "gameforge-data"));

const recordKey = (id: string) => `game:${id}`;
const blobPrefix = process.env.GAMEFORGE_BLOB_PREFIX?.trim() || "gameforge";
const blobPath = (id: string, filename: string) => `${blobPrefix}/${id}/${filename}`;

function assertRemoteReady() {
  if (isVercel && !useRemoteStorage) {
    throw new Error(
      "Missing Vercel KV/Blob configuration. Set KV_* env vars and BLOB_READ_WRITE_TOKEN."
    );
  }
}

async function ensureDir(dir: string) {
  if (useRemoteStorage) return;
  await fs.mkdir(dir, { recursive: true });
}

function recordPath(id: string) {
  return path.join(baseDir, id, "record.json");
}

function assetDir(id: string) {
  return path.join(baseDir, id, "assets");
}

function parseRecord(raw: unknown): GameRecord | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GameRecord;
    } catch {
      return null;
    }
  }
  return raw as GameRecord;
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
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
  if (useRemoteStorage) {
    assertRemoteReady();
    await kv.set(recordKey(id), JSON.stringify(record));
  } else {
    await ensureDir(path.join(baseDir, id));
    await ensureDir(assetDir(id));
    await fs.writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf-8");
  }
  return record;
}

export async function loadGameRecord(id: string): Promise<GameRecord | null> {
  try {
    if (useRemoteStorage) {
      assertRemoteReady();
      const raw = await kv.get<string>(recordKey(id));
      return parseRecord(raw);
    }
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
  if (useRemoteStorage) {
    assertRemoteReady();
    await kv.set(recordKey(id), JSON.stringify(next));
  } else {
    await fs.writeFile(recordPath(id), JSON.stringify(next, null, 2), "utf-8");
  }
  return next;
}

export async function listGames(): Promise<GameRecord[]> {
  try {
    const records: GameRecord[] = [];
    if (useRemoteStorage) {
      assertRemoteReady();
      for await (const key of kv.scanIterator({ match: "game:*", count: 100 })) {
        const raw = await kv.get<string>(String(key));
        const record = parseRecord(raw);
        if (record) records.push(record);
      }
    } else {
      await ensureDir(baseDir);
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      for (const id of ids) {
        const record = await loadGameRecord(id);
        if (record) records.push(record);
      }
    }
    return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveAssetFile(id: string, filename: string, buffer: Buffer) {
  if (useRemoteStorage) {
    assertRemoteReady();
    const pathname = blobPath(id, filename);
    await blobPut(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: guessContentType(filename),
    });
    return pathname;
  }
  await ensureDir(assetDir(id));
  const filePath = path.join(assetDir(id), filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function readAssetFile(id: string, filename: string) {
  if (useRemoteStorage) {
    assertRemoteReady();
    if (filename.startsWith("http")) {
      const res = await fetch(filename);
      if (!res.ok) throw new Error(`Failed to fetch asset ${filename}`);
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }
    const meta = await blobHead(blobPath(id, filename));
    const res = await fetch(meta.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch blob ${meta.url}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  const filePath = path.join(assetDir(id), filename);
  return fs.readFile(filePath);
}

export function getAssetFilePath(id: string, filename: string) {
  if (useRemoteStorage) return blobPath(id, filename);
  return path.join(assetDir(id), filename);
}

export async function deleteGameRecord(id: string) {
  try {
    if (useRemoteStorage) {
      assertRemoteReady();
      await kv.del(recordKey(id));
      const prefix = `${blobPrefix}/${id}/`;
      let cursor: string | undefined = undefined;
      do {
        const res = await blobList({ prefix, cursor });
        if (res.blobs.length > 0) {
          await blobDel(res.blobs.map((b) => b.url));
        }
        cursor = res.cursor;
      } while (cursor);
      return true;
    }
    await fs.rm(path.join(baseDir, id), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

