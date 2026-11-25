"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

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
    <div className={`flex items-center border border-ink/70 font-mono text-[11px] ${isPending ? 'opacity-60' : ''}`} role="group" aria-label="Language">
      {([['zh', '中'], ['en', 'EN']] as const).map(([code, label], i) => (
        <button
          key={code}
          type="button"
          onClick={() => code !== currentLocale && handleChange(code)}
          aria-pressed={code === currentLocale}
          className={`px-2 py-1 transition ${i ? 'border-l border-ink/70' : ''} ${code === currentLocale ? 'bg-ink text-paper' : 'text-ink2 hover:bg-ink/5'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
