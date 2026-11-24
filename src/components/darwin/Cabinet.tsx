'use client';
import {evidenceUrl, fmt, geneOf, type Run} from './common';

export function Cabinet({run, gameId, locale, onOpen}: {run: Run; gameId: string; locale: string; onOpen: (sid: string) => void}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const species = run.evolution?.species || []; const archive = run.evolution?.archive || {};
  const tiers = [L('低', 'low'), L('中', 'mid'), L('高', 'high')];
  return <div className="fade-up">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="label-mono">MAP-Elites · {L('质量多样性档案库', 'quality-diversity archive')}</div>
        <h2 className="mt-2 font-serif text-4xl text-white">{L('标本柜', 'Specimen cabinet')}</h2>
        <p className="mt-2 max-w-2xl text-muted">{L('每一格只保留该行为区间里适应度最高的物种。横轴是真实试玩中的挑战度（失败与掉血），纵轴是 AI 玩家实际推进的进度——不是模型自报，而是游戏桥接状态。', 'Each cell keeps only the fittest species of its behaviour niche. X: challenge measured in real play (deaths, damage). Y: progress actually reached by AI players, read from the game bridge, not self-reported.')}</p>
      </div>
      <div className="label-mono">{Object.keys(archive).length}/9 {L('格已占据', 'cells filled')}</div>
    </div>
    <div className="mx-auto grid max-w-6xl grid-cols-[28px_1fr] gap-3">
      <div className="flex items-center justify-center"><span className="label-mono -rotate-90 whitespace-nowrap">{L('进度 →', 'PROGRESS →')}</span></div>
      <div className="grid grid-cols-3 gap-3">
        {[2, 1, 0].flatMap(y => [0, 1, 2].map(x => {
          const sid = archive[`${x}-${y}`]; const s = species.find(v => v.id === sid);
          const members = species.filter(v => v.status === 'alive' && v.cell?.[0] === x && v.cell?.[1] === y);
          const thumb = s?.frames?.[Math.min(4, (s.frames.length || 1) - 1)];
          return <button key={`${x}-${y}`} disabled={!s} onClick={() => s && onOpen(s.id)}
            className={`group relative aspect-[16/8] overflow-hidden rounded-xl border text-left transition ${s ? 'border-border hover:border-primary/60' : 'border-dashed border-border/60'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames from a local API */}
            {thumb && <img alt="" src={evidenceUrl(gameId, run.id, thumb)} className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-100" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/40 to-transparent" />
            <div className="absolute left-3 top-3 font-mono text-[10px] text-text/60">{x}-{y} · {L('挑战', 'chal')} {tiers[x]} · {L('进度', 'prog')} {tiers[y]}</div>
            {s ? <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{background: geneOf(s.gene).color, boxShadow: `0 0 10px ${geneOf(s.gene).color}`}} /><span className="font-serif text-xl text-white">{s.name || s.id}</span></div>
              <div className="mt-1 font-mono text-[11px] text-text/70">F {fmt(s.fitness?.F)} · {L(`第 ${s.gen} 代`, `gen ${s.gen}`)} · {members.length} {L('个物种竞争此格', 'competing')}</div>
            </div> : <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-muted/60">{L('空生态位', 'empty niche')}</div>}
          </button>;
        }))}
      </div>
      <div />
      <div className="label-mono text-center">{L('挑战度 →', 'CHALLENGE →')}</div>
    </div>
  </div>;
}
