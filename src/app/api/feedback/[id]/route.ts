import {saveFeedback} from '@/lib/improvement';import {redact} from '@/lib/providers';
export async function POST(req:Request,{params}:{params:{id:string}}){try{return Response.json(await saveFeedback(params.id,await req.json()));}catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}}
