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
    <div className={`flex items-center gap-1 font-cond text-[13px] font-extrabold italic ${isPending ? 'opacity-60' : ''}`} role="group" aria-label="Language">
      {([['zh', '中'], ['en', 'EN']] as const).map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => code !== currentLocale && handleChange(code)}
          aria-pressed={code === currentLocale}
          className={`-skew-x-[10deg] border-2 px-2.5 py-1 transition ${code === currentLocale ? 'border-snow bg-snow text-jet' : 'border-snow/40 text-snow/70 hover:border-snow hover:text-snow'}`}
        >
          <span className="inline-block skew-x-[10deg]">{label}</span>
        </button>
      ))}
    </div>
  );
}
