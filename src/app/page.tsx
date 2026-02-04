import { redirect } from 'next/navigation';

import { defaultLocale } from '@/i18n/request';

/**
 * Redirect the bare root path (/) to the default locale.
 *
 * We keep this redirect in a page, NOT in the root layout, to avoid redirect loops.
 */
export default function IndexPage() {
  redirect(`/${defaultLocale}`);
}
