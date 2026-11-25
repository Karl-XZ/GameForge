'use client';
import {evidenceUrl, fmt, geneOf, SWATCH, type Run} from './common';

export function Cabinet({run, gameId, locale, onOpen}: {run: Run; gameId: string; locale: string; onOpen: (sid: string) => void}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const species = run.evolution?.species || []; const archive = run.evolution?.archive || {};
  const tiers = [L('低', 'Low'), L('中', 'Mid'), L('高', 'High')];
  return <div className="fade-up">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="tag tag-white"><span>MAP-Elites · {L('质量多样性档案库', 'quality-diversity archive')}</span></div>
        <h2 className="shout mt-5 -skew-x-[6deg] text-[44px] leading-none md:text-[60px]">{L('标本柜', 'Specimen cabinet')}</h2>
      </div>
      <div className="flex items-stretch gap-5">
        <p className="max-w-[460px] bg-jet px-4 py-3 text-[13px] leading-6 text-snow/80">{L('每一格只保留该行为区间里适应度最高的物种。横轴是真实试玩中的挑战度（失败与掉血），纵轴是 AI 玩家实际推进的进度，读自游戏本身，不采信模型自报。', 'Each cell keeps only the fittest species of its niche. X: challenge measured in real play (deaths, damage). Y: progress actually reached, read from the game itself, never self-reported.')}</p>
        <div className="-skew-x-[6deg] border-[3px] border-jet bg-volt px-5 py-3 shadow-hard"><div className="skew-x-[6deg] text-center"><div className="font-display text-[56px] leading-none num">{Object.keys(archive).length}<span className="text-[26px] text-pop">/9</span></div><div className="heavy mt-1 text-[12px]">{L('格已占据', 'cells filled')}</div></div></div>
      </div>
    </div>
    <div className="mx-auto grid max-w-[1180px] grid-cols-[40px_1fr] gap-x-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute bottom-0 top-0 w-[4px] bg-jet" />
        <span className="tag relative -rotate-90 text-[13px]"><span>{L('进度', 'Progress')} →</span></span>
      </div>
      <div className="plate grid grid-cols-3 gap-[3px] bg-jet p-[3px] shadow-hard-lg">
        {[2, 1, 0].flatMap(y => [0, 1, 2].map(x => {
          const sid = archive[`${x}-${y}`]; const s = species.find(v => v.id === sid);
          const members = species.filter(v => v.status === 'alive' && v.cell?.[0] === x && v.cell?.[1] === y);
          const thumb = s?.frames?.[Math.min(4, (s.frames.length || 1) - 1)];
          return <button key={`${x}-${y}`} disabled={!s} onClick={() => s && onOpen(s.id)}
            className={`group relative flex flex-col p-3 text-left transition md:p-4 ${s ? 'bg-snow hover:bg-volt' : 'hatch cursor-default bg-bone'}`}>
            <div className="mb-2.5 flex items-center justify-between"><span className="font-display text-[18px] leading-none text-jet/30 num group-hover:text-pop">{x}-{y}</span><span className="hidden font-cond text-[12px] font-bold uppercase text-ink3 sm:inline">{L('挑战', 'chal.')} {tiers[x]} · {L('进度', 'prog.')} {tiers[y]}</span></div>
            <div className={`relative aspect-[16/9] w-full overflow-hidden border-[2.5px] border-jet ${s ? 'bg-jet' : 'bg-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames from a local API */}
              {thumb && <img alt="" src={evidenceUrl(gameId, run.id, thumb)} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.05]" />}
              {!s && <div className="absolute inset-0 flex items-center justify-center"><span className="tag tag-white"><span>{L('空生态位', 'Empty niche')}</span></span></div>}
            </div>
            {s ? <div className="mt-3 min-w-0">
              <div className="flex items-center gap-2"><span className={SWATCH} style={{background: geneOf(s.gene).color}} /><span className="heavy truncate text-[18px]">{s.name || s.id}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-ink3 num"><span className="font-semibold text-pop">F {fmt(s.fitness?.F)}</span><span>{L(`第 ${s.gen} 代`, `gen ${s.gen}`)}</span><span>{members.length} {L('个竞争者', 'competing')}</span></div>
            </div> : <div className="mt-3 h-[46px]" />}
          </button>;
        }))}
      </div>
      <div />
      <div className="relative mt-4 flex justify-center"><div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 bg-jet" /><span className="tag relative text-[13px]"><span>{L('挑战度', 'Challenge')} →</span></span></div>
    </div>
  </div>;
}
