import {speciesFile} from '@/lib/evolution';
export const runtime='nodejs';export const dynamic='force-dynamic';
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-pointer-lock";
export async function GET(_:Request,{params}:{params:{id:string;run:string;sid:string;file:string[]}}){
  try{
    const headers={'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'};
    const result=await speciesFile(params.id,params.run,params.sid,params.file);
    if('html' in result) return new Response(result.html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP}});
    return new Response(new Uint8Array(result.bytes!),{headers:{...headers,'Content-Type':'image/'+(params.file[1].endsWith('.webp')?'webp':'png')}});
  }catch{return new Response('Species unavailable',{status:404});}
}
