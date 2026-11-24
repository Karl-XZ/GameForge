import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
const localeMiddleware=createMiddleware({locales:['en','zh'],defaultLocale:'en'});
export default function middleware(req:NextRequest) {
  const hostname=(req.headers.get('host')||'').replace(/:\d+$/,'');
  const local=['localhost','127.0.0.1','[::1]'].includes(hostname);
  const token=process.env.GAMEFORGE_ACCESS_TOKEN;
  if (token) {
    const auth=req.headers.get('authorization')||'';
    let supplied=auth.startsWith('Bearer ')?auth.slice(7):'';
    try {if(auth.startsWith('Basic ')) supplied=atob(auth.slice(6)).split(':').slice(1).join(':');} catch {}
    if(supplied!==token) return new NextResponse('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic realm="GameForge"'}});
  } else if(!local) return new NextResponse('Configure GAMEFORGE_ACCESS_TOKEN for remote access',{status:403});
  if(req.nextUrl.pathname.startsWith('/api/')) {
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.headers.get('origin');
      const expectedOrigin=process.env.GAMEFORGE_ORIGIN || `${req.nextUrl.protocol}//${req.headers.get('host')}`;
      if(origin && origin!==expectedOrigin) return new NextResponse('Cross-origin write denied',{status:403});
    }
    return NextResponse.next();
  }
  return localeMiddleware(req);
}
export const config={matcher:['/','/(zh|en)/:path*','/game/:path*','/api/:path*']};
