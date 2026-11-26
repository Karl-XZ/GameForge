import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { dataRoot, readAssetFile, safeId } from './store';
import { validatePlayableHtml } from './playableHtml';
import { generationSignal } from './generationContext';

/** The original game is built by a DeepSeek Harness (dsh) studio: it writes, playtests, looks at its own
 *  screenshots, takes one real critique and revises. Single-shot generation stays as the fallback. */
export function dshBinary() {
  const candidates = [process.env.GAMEFORGE_DSH, path.join(process.cwd(), '.tools/dsh/node_modules/.bin/dsh')].filter(Boolean) as string[];
  return candidates.find((file) => existsSync(file)) || null;
}

export function studioEnabled(model: string) {
  return process.env.GAMEFORGE_STUDIO !== 'single' && !!process.env.DEEPSEEK_API_KEY && model.startsWith('deepseek/') && !!dshBinary();
}

export type StudioReport = { minutes: number; toolCalls: number; playtests: number; imagesViewed: number; revised: boolean; critique?: any; final?: string };

export async function buildWithStudio(opts: { gameId: string; prompt: string; language: string; plan: any; assets: { id: string; type: string; file: string }[] }) {
  const folder = path.join(dataRoot(), safeId(opts.gameId), 'studio', `origin-${Date.now()}`);
  await fs.mkdir(path.join(folder, 'assets'), { recursive: true });
  for (const asset of opts.assets) await fs.writeFile(path.join(folder, 'assets', asset.file), await readAssetFile(opts.gameId, asset.file));
  const minutes = Number(process.env.GAMEFORGE_STUDIO_MINUTES || 30);
  await fs.writeFile(path.join(folder, 'job.json'), JSON.stringify({ prompt: opts.prompt, language: opts.language, plan: opts.plan, assets: opts.assets, minutes }, null, 1));
  const python = process.env.GAMEFORGE_PYTHON || 'python3';
  const signal = generationSignal();
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, [path.join(process.cwd(), 'worker/studio.py'), 'origin', folder], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err = (err + chunk).slice(-4000); });
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0) resolve(out); else reject(new Error(`Studio exited (${code}): ${err.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 400)}`));
    });
  });
  const report = JSON.parse(output.trim().split('\n').pop() || '{}');
  if (!report.valid) throw new Error('Studio did not deliver a playable game: ' + String(report.team?.gate || report.team?.error || 'unknown'));
  const html = validatePlayableHtml(await fs.readFile(path.join(folder, 'index.html'), 'utf8'));
  const team = report.team || {}, revision = report.revision || {};
  const summary: StudioReport = {
    minutes: Math.round(((team.minutes || 0) + (revision.minutes || 0)) * 10) / 10,
    toolCalls: (team.toolCalls || 0) + (revision.toolCalls || 0),
    playtests: (team.playtests || 0) + (revision.playtests || 0),
    imagesViewed: (team.imagesViewed || 0) + (revision.imagesViewed || 0),
    revised: !!report.revision, critique: report.critique || undefined, final: String(revision.final || team.final || '').slice(0, 2000),
  };
  return { html, report: summary };
}
