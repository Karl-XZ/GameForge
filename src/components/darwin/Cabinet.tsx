'use client';
import {evidenceUrl, fmt, geneOf, type Run} from './common';

export function Cabinet({run, gameId, locale, onOpen}: {run: Run; gameId: string; locale: string; onOpen: (sid: string) => void}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const species = run.evolution?.species || []; const archive = run.evolution?.archive || {};
  const tiers = [L('低', 'Low'), L('中', 'Mid'), L('高', 'High')];
  return <div className="fade-up">
    <div className="mb-10 grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="eyebrow">MAP-Elites · {L('质量多样性档案库', 'quality-diversity archive')}</div>
        <h2 className="mt-3 font-serif text-[44px] font-bold leading-tight">{L('标本柜', 'Specimen cabinet')}</h2>
      </div>
      <div className="flex items-end justify-between gap-6 lg:col-span-5">
        <p className="text-[14px] leading-7 text-ink2">{L('每一格只保留该行为区间里适应度最高的物种。横轴是真实试玩中的挑战度（失败与掉血），纵轴是 AI 玩家实际推进的进度，读自游戏本身，不采信模型自报。', 'Each cell keeps only the fittest species of its niche. X: challenge measured in real play (deaths, damage). Y: progress actually reached, read from the game itself, never self-reported.')}</p>
        <div className="shrink-0 text-right"><div className="font-display text-[52px] leading-none num">{Object.keys(archive).length}<span className="text-[26px] text-ink3">/9</span></div><div className="mt-1 text-[12px] text-ink3">{L('格已占据', 'cells filled')}</div></div>
      </div>
    </div>
    <div className="mx-auto grid max-w-[1180px] grid-cols-[34px_1fr] gap-x-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute bottom-0 top-0 w-px bg-ink" />
        <span className="relative -rotate-90 whitespace-nowrap bg-paper px-2 text-[12px] text-ink2">{L('进度', 'Progress')} →</span>
      </div>
      <div className="grid grid-cols-3 border-l border-t border-ink">
        {[2, 1, 0].flatMap(y => [0, 1, 2].map(x => {
          const sid = archive[`${x}-${y}`]; const s = species.find(v => v.id === sid);
          const members = species.filter(v => v.status === 'alive' && v.cell?.[0] === x && v.cell?.[1] === y);
          const thumb = s?.frames?.[Math.min(4, (s.frames.length || 1) - 1)];
          return <button key={`${x}-${y}`} disabled={!s} onClick={() => s && onOpen(s.id)}
            className={`group flex flex-col border-b border-r border-ink p-3 text-left transition md:p-4 ${s ? 'hover:bg-card' : 'cursor-default'}`}>
            <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] text-ink3"><span>{x}-{y}</span><span className="hidden sm:inline">{L('挑战', 'chal.')} {tiers[x]} · {L('进度', 'prog.')} {tiers[y]}</span></div>
            <div className={`relative aspect-[16/9] w-full overflow-hidden border ${s ? 'border-ink/80 bg-ink' : 'hatch border-rule'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames from a local API */}
              {thumb && <img alt="" src={evidenceUrl(gameId, run.id, thumb)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />}
              {!s && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ink3">{L('空生态位', 'Empty niche')}</div>}
            </div>
            {s ? <div className="mt-3 min-w-0">
              <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{background: geneOf(s.gene).color}} /><span className="truncate font-serif text-[18px] font-semibold">{s.name || s.id}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-ink3 num"><span>F {fmt(s.fitness?.F)}</span><span>{L(`第 ${s.gen} 代`, `gen ${s.gen}`)}</span><span>{members.length} {L('个竞争者', 'competing')}</span></div>
            </div> : <div className="mt-3 h-[46px]" />}
          </button>;
        }))}
      </div>
      <div />
      <div className="relative mt-3 flex justify-center"><div className="absolute left-0 right-0 top-1/2 h-px bg-ink" /><span className="relative bg-paper px-2 text-[12px] text-ink2">{L('挑战度', 'Challenge')} →</span></div>
    </div>
  </div>;
}
