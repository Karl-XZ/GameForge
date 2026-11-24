import { loadVersion, readVersionAsset } from '@/lib/versions';
import { buildSideScrollerHtml, buildTextAdventureHtml } from '@/lib/export';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_: Request, {params}: {params:{id:string;version:string;file:string[]}}) {
  try {
    const version = await loadVersion(params.id, params.version);
    if (!version) return new Response('Version not found',{status:404});
    const headers = {'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'};
    if (params.file.join('/') === 'index.html') {
      const html = version.entryHtml || (version.record.mode === 'side-scroller' ? buildSideScrollerHtml(version.record) : buildTextAdventureHtml(version.record));
      return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-pointer-lock"}});
    }
    if (params.file.length !== 2 || params.file[0] !== 'assets') return new Response('Not found',{status:404});
    const bytes = await readVersionAsset(version, params.file[1]);
    return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'image/'+(params.file[1].endsWith('.webp')?'webp':'png')}});
  } catch {return new Response('Invalid or damaged version',{status:400});}
}
