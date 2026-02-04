import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Export the locales and defaultLocale
export const locales = ['en', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async (ctx: any) => {
  /**
   * next-intl changed its request config signature across versions.
   * - Some versions pass `{locale}` directly.
   * - Newer versions pass `{requestLocale}` (a promise or function) and
   *   require returning `locale` explicitly.
   *
   * To avoid runtime errors and redirect loops, resolve the locale defensively
   * and always return it.
   */

  let locale: string | undefined = ctx?.locale;

  // Support next-intl v3+ where `requestLocale` is provided.
  if (!locale && ctx?.requestLocale) {
    try {
      // `requestLocale` can be a promise, a function returning a promise, or a string.
      const rl = typeof ctx.requestLocale === 'function' ? await ctx.requestLocale() : await ctx.requestLocale;
      locale = rl;
    } catch {
      // Ignore and fall back to defaultLocale.
    }
  }

  const resolved = (locale || defaultLocale) as Locale;

  // Validate that the incoming locale is supported.
  if (!locales.includes(resolved)) notFound();

  return {
    // IMPORTANT: return `locale` explicitly to satisfy next-intl.
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
