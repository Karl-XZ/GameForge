import {interview} from '@/lib/evolution';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
export async function POST(req:Request,{params}:{params:{id:string;run:string}}){try{return Response.json(await interview(params.id,params.run,await req.json()));}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
