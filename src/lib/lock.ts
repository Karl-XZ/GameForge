import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataRoot, safeId } from './store';

const held = new AsyncLocalStorage<Set<string>>();
export async function withGameLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  safeId(id);
  if (held.getStore()?.has(id)) return action();
  const file = path.join(dataRoot(), `${id}.lock`);
  await fs.mkdir(dataRoot(), {recursive:true});
  const deadline = Date.now() + 30000;
  for (;;) {
    try { await fs.mkdir(file); break; }
    catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
      const info=await fs.stat(file).catch((error:any)=>{if(error.code==='ENOENT')return null;throw error;});
      if(!info) continue;
      if (Date.now() - info.mtimeMs > 600000) throw new Error('Stale project lock; inspect worker before removing '+file);
      if (Date.now() > deadline) throw new Error('Project is busy');
      await new Promise(r => setTimeout(r, 30));
    }
  }
  try { return await held.run(new Set([...(held.getStore() || []),id]), action); }
  finally { await fs.rmdir(file); }
}
