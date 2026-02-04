"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { locales } from '@/i18n/request';

export function LanguageSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentLocale = pathname.split('/')[1] || 'en';

  const handleChange = (newLocale: string) => {
    startTransition(() => {
      const segments = pathname.split('/');
      segments[1] = newLocale;
      const newPathname = segments.join('/');
      router.push(newPathname);
    });
  };

  return (
    <select
      value={currentLocale}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-lg border border-border bg-panel2 px-2 py-1 text-sm outline-none cursor-pointer hover:border-primary/50 transition-colors"
    >
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
