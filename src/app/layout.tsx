import './globals.css';

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import { defaultLocale, locales, type Locale } from '@/i18n/request';

export const metadata: Metadata = {
  title: 'GameForge · 游戏锻造与达尔文进化',
  description:
    'Generate playable games from one sentence, then let them evolve: real AI playtests, blind reviews, a simulated player society and natural selection.',
};

/**
 * Root layout
 *
 * IMPORTANT:
 * - Do NOT redirect from here. Redirecting in the root layout can create infinite 307 loops
 *   because this file wraps ALL routes (including /en).
 * - We set the <html lang> attribute based on the locale detected by next-intl middleware.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // next-intl middleware typically stores the chosen locale in a cookie.
  // We read both cookie and header defensively for compatibility.
  const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
  const headerLocale = headers().get('x-next-intl-locale') ?? undefined;

  const candidate = (cookieLocale || headerLocale || defaultLocale) as Locale;
  const lang = locales.includes(candidate) ? candidate : defaultLocale;

  return (
    <html lang={lang}>
      <head>
        <meta name="theme-color" content="#F2EEE4" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=Noto+Serif+SC:wght@400;600;700;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
