import {overview} from '@/lib/evolution';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({ok:true,...await overview()});}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
