import {Script} from 'node:vm';
import {generateText} from './gemini';

export function validatePlayableHtml(html:string,requireBridge=true) {
  if(!/<html[\s>]/i.test(html)||!/<\/html>/i.test(html))throw Error('Incomplete HTML document');
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  if(!scripts.length)throw Error('Missing inline game JavaScript');
  for(const script of scripts) {
    if(/\bsrc\s*=/i.test(script[1]))throw Error('No external game scripts allowed');
    if(/\btype\s*=\s*["']application\/json/i.test(script[1]))continue;
    try {new Script(script[2],{filename:'generated-game.js'});}catch(e){throw Error('JavaScript syntax error: '+String(e));}
  }
  if(requireBridge && !html.includes('GameAgentBridge'))throw Error('Missing GameAgentBridge');
  return html;
}

export async function generatePlayableHtml(opts:{model:string;prompt:string}) {
  let prompt=opts.prompt;
  for(let attempt=0;attempt<3;attempt++) {
    const html=(await generateText({model:opts.model,prompt})).trim().replace(/^```(?:html)?\s*/i,'').replace(/\s*```$/,'');
    try{return validatePlayableHtml(html);}catch(e){
      if(attempt===2)throw e;
      prompt=`Repair this HTML. ${String(e)}. Keep the intended game, all assets and genuine GameAgentBridge. Return ONLY complete raw HTML.\n${html}`;
    }
  }
  throw Error('Game HTML generation failed');
}
