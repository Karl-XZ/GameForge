import {gameEvolution} from '@/lib/evolution';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:{id:string}}){try{return Response.json({ok:true,...await gameEvolution(params.id)});}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
