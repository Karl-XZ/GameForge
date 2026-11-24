import {promises as fs} from 'node:fs';import path from 'node:path';import {runDir} from '@/lib/improvement';import {digest} from '@/lib/versions';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:{id:string;run:string;file:string[]}}){try{
 if(params.file.length<2 || params.file.some(f=>!/^[-a-zA-Z0-9_.]+$/.test(f)||f.includes('..'))) throw Error();
 const root=path.join(runDir(params.id,params.run),'evidence',params.file[0]);const name=params.file.slice(1).join('/');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));const bytes=await fs.readFile(path.join(root,name));
 if(digest(bytes)!==manifest[name]) return new Response('Evidence integrity failure',{status:409});
 const type=name.endsWith('.png')?'image/png':name.endsWith('.mp4')?'video/mp4':name.endsWith('.webm')?'video/webm':name.endsWith('.json')?'application/json':'application/octet-stream';
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':type,'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'}});
}catch{return new Response('Evidence unavailable',{status:404});}}
