import {getRun,controlRun} from '@/lib/improvement';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:{id:string;run:string}}){try{return Response.json({ok:true,run:await getRun(params.id,params.run)});}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
export async function POST(req:Request,{params}:{params:{id:string;run:string}}){try{return Response.json(await controlRun(params.id,params.run,(await req.json()).action));}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
