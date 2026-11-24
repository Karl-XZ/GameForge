import { listVersions, selectVersion, snapshotGame } from '@/lib/versions';
import { redact } from '@/lib/providers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_:Request,{params}:{params:{id:string}}) {
  try {const current=await snapshotGame(params.id);return Response.json({ok:true,current:current.id,versions:(await listVersions(params.id)).map(({id,label,createdAt,parent})=>({id,label,createdAt,parent}))});}
  catch(e){return Response.json({ok:false,error:redact(String(e))},{status:400});}
}
export async function POST(req:Request,{params}:{params:{id:string}}) {
  try {const body=await req.json();const version=await selectVersion(params.id,body.version,body.expectedVersion);return Response.json({ok:true,version:version.id});}
  catch(e){return Response.json({ok:false,error:redact(String(e))},{status:409});}
}
