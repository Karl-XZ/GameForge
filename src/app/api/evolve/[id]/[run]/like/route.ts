import {likeSpecies} from '@/lib/evolution';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:{id:string;run:string}}){try{return Response.json(await likeSpecies(params.id,params.run,String((await req.json()).species||'')));}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
