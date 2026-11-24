import {generateGame} from '@/lib/generation';
import {redact} from '@/lib/providers';
import {withGenerationSignal} from '@/lib/generationContext';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:Request) {
  const body=Object.fromEntries((await req.formData()).entries());
  const encoder=new TextEncoder();let connected=true;const cancellation=new AbortController();
  return new Response(new ReadableStream({start(controller) {
    const emit=async(event:any)=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify({...event,ts:new Date().toISOString()})+'\n'));}catch{connected=false;}};
    void withGenerationSignal(cancellation.signal,()=>generateGame(body,emit)).catch(error=>emit({type:'fatal',error:redact(String(error.message||error))})).finally(()=>{if(connected)try{controller.close();}catch{}});
  },cancel(){connected=false;cancellation.abort();}}),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform'}});
}
