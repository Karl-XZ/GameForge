import {createRun,listRuns} from '@/lib/improvement';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:{id:string}}){try{return Response.json({ok:true,runs:await listRuns(params.id)});}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
export async function POST(req:Request,{params}:{params:{id:string}}){try{return Response.json({ok:true,run:await createRun(params.id,await req.json())});}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
