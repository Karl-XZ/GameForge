import './globals.css';

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import { defaultLocale, locales, type Locale } from '@/i18n/request';

export const metadata: Metadata = {
  title: 'GameForge',
  description:
    'One‑click generators for Text Adventure / TRPG and Side‑Scroller Action games, powered by Gemini.',
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
      <body>{children}</body>
    </html>
  );
}
