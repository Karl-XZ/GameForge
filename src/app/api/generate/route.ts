import {NextResponse} from 'next/server';
import {generateGame} from '@/lib/generation';
import {redact} from '@/lib/providers';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export async function POST(req:Request) {
  try {const input=req.headers.get('content-type')?.includes('application/json')?await req.json():Object.fromEntries((await req.formData()).entries());return NextResponse.json(await generateGame(input));}
  catch(error:any){return NextResponse.json({ok:false,error:redact(error.message)},{status:500});}
}
