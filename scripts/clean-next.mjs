import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const nextDir = resolve(process.cwd(), '.next');

if (!existsSync(nextDir)) {
  console.log('[clean-next] .next not found; nothing to clean.');
  process.exit(0);
}

try {
  rmSync(nextDir, { recursive: true, force: true });
  console.log('[clean-next] removed .next');
} catch (error) {
  console.warn('[clean-next] failed to remove .next.');
  console.warn('[clean-next] close any running Next.js dev/build processes and retry.');
  if (error && typeof error === 'object' && 'message' in error) {
    console.warn(`[clean-next] ${error.message}`);
  }
}
