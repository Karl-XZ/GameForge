'use client';
import {useEffect, useMemo, useState} from 'react';
import {ACTIVE, api, GENE, geneOf, PHASE, type Run, useEvolution} from './common';
import {Galaxy} from './Galaxy';
import {Specimen} from './Specimen';
import {Cabinet} from './Cabinet';
import {Observatory} from './Observatory';
import {Method} from './Method';

export type HubTab = 'galaxy' | 'specimen' | 'cabinet' | 'observatory' | 'method';
type GameLite = {id: string; mode: string; title?: string; createdAt: string; prompt?: string};

const PHASES = ['baseline', 'design', 'build', 'play', 'review', 'society', 'select'];

function EvolvePanel({gameId, run, locale, onStarted}: {gameId: string; run?: Run; locale: string; onStarted: (id: string) => void}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const [goal, setGoal] = useState(L('让新玩家更快理解目标，跳跃手感更好，节奏更紧凑，同时让游戏更有个性。', 'Clearer goals for new players, better jump feel, tighter pacing and more personality.'));
  const [gens, setGens] = useState(3); const [kids, setKids] = useState(2); const [calls, setCalls] = useState(44); const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const active = run && ACTIVE.includes(run.status);
  const evo = run?.evolution; const focus = evo?.species.find(s => s.id === run?.focus);
  const start = async () => {
    setBusy(true); setErr('');
    try {
      const versions = await api(`/api/versions/${gameId}`);
      const r = await api(`/api/improve/${gameId}`, {kind: 'evolve', requestId: crypto.randomUUID(), baseVersion: versions.current, goal, constraints: L('保留题材、核心玩法、操作方式和现有素材；不得作弊、不得删除真实挑战。', 'Keep genre, core loop, controls and assets; no cheats or removed challenge.'), budgets: {generations: gens, children: kids, calls, minutes, episodes: 3}});
      onStarted(r.run.id); setOpen(false);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const phaseIdx = run ? PHASES.indexOf(run.phase) : -1;
  const outcome = run?.status !== 'completed' ? null
    : run.outcome === 'evolved_proxy' && evo?.champion !== 's0r' ? L('冠军赢下了两次盲评，可以在标本页试玩并选用。', 'The champion won both blind reviews; play and apply it from its specimen page.')
    : run.outcome === 'repaired' || evo?.champion === 's0r' ? L('原版在真实试玩中崩溃，修复突变让它重新可玩；后代暂未赢下两次盲评。', 'The original crashed in real play and a repair mutation fixed it. No offspring has won both reviews yet.')
    : L('没有后代赢下两次盲评，保留原始物种。', 'No offspring won both reviews; the original is retained.');
  return <div className="pointer-events-auto w-[320px] border border-ink bg-card shadow-plate">
    {run && <div className="space-y-4 p-5">
      <div className="flex items-baseline justify-between">
        <span className={`flex items-center gap-2 text-[14px] font-medium ${run.status === 'failed' ? 'text-vermilion' : ''}`}>
          {active && <span className="breathe inline-block h-2 w-2 rounded-full bg-vermilion" />}
          {(PHASE[run.phase] || [run.phase, run.phase])[zh ? 0 : 1]}
        </span>
        <span className="font-mono text-[11px] text-ink3 num">{L('第', 'GEN')} {evo?.generation ?? 0}/{evo?.generations ?? run.budgets.generations}{L(' 代', '')}</span>
      </div>
      <div className="grid grid-cols-7 gap-[3px]" aria-hidden>
        {PHASES.map((p, i) => <div key={p} className={`h-[3px] ${active && i === phaseIdx ? 'marching' : run.status === 'completed' || i < phaseIdx ? 'bg-ink' : 'bg-rule'}`} />)}
      </div>
      {focus && active && <div className="text-[13px] text-ink2">{L('正在处理', 'Working on')} <span className="font-serif font-semibold text-ink">{focus.name || focus.id}</span> <span className="text-ink3">· {zh ? geneOf(focus.gene).zh : geneOf(focus.gene).en}</span></div>}
      <div className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
        {[[L('物种', 'Species'), evo?.species.length ?? 0], [L('存活', 'Alive'), evo?.species.filter(s => s.status === 'alive').length ?? 0], [L('调用', 'Calls'), `${run.calls?.length ?? 0}`]].map(([k, v], i) =>
          <div key={i} className="px-3 py-3 first:pl-0"><div className="font-display text-[30px] leading-none num">{v}</div><div className="mt-1 text-[11px] text-ink3">{k}{i === 2 ? ` / ${run.budgets.calls}` : ''}</div></div>)}
      </div>
      {run.error && <p className="text-[12px] leading-5 text-vermilion">{run.error}</p>}
      {outcome && <p className="text-[13px] leading-6 text-ink2">{outcome}</p>}
      <div className="flex gap-2">
        {active && <button className="btn-quiet flex-1" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'stop'})}>{L('停止', 'Stop')}</button>}
        {['stopped', 'failed'].includes(run.status) && <button className="btn-quiet flex-1" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'resume'})}>{L('从检查点恢复', 'Resume')}</button>}
        {!active && <button className="btn-line flex-1" onClick={() => setOpen(!open)}>{open ? L('收起', 'Hide') : L('新一轮进化', 'New run')}</button>}
      </div>
    </div>}
    {(open || !run) && !active && <div className={`space-y-4 p-5 ${run ? 'border-t border-rule bg-paper/50' : ''}`}>
      {!run && <div className="font-serif text-[17px] font-semibold">{L('开始第一次进化', 'Start the first run')}</div>}
      <label className="block text-[12px] font-medium text-ink2">{L('进化方向（选择压力）', 'Direction (selection pressure)')}<textarea className="field mt-2 font-serif text-[14px] leading-7" rows={3} value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        {([[L('代数', 'Generations'), gens, setGens, 1, 5], [L('每代后代', 'Children/gen'), kids, setKids, 1, 3], [L('调用上限', 'Call budget'), calls, setCalls, 8, 80], [L('分钟上限', 'Minutes'), minutes, setMinutes, 5, 90]] as const).map(([l, v, set, min, max]) =>
          <label key={l as string} className="block text-[12px] font-medium text-ink2">{l}<input type="number" min={min} max={max} value={v as number} onChange={e => (set as any)(Number(e.target.value))} className="field mt-1.5 py-2 font-mono" /></label>)}
      </div>
      <p className="text-[11px] leading-5 text-ink3">{L(`预计约 ${2 + gens * kids * 6} 次调用。每个后代：设计、制作、试玩策略、社会推演，加 2 次盲评。`, `About ${2 + gens * kids * 6} calls. Each child: design, build, player policy, society, plus 2 reviews.`)}</p>
      <button disabled={busy} onClick={start} className="btn-red w-full py-3 text-[14px]">{busy ? '…' : <>{L('开始进化', 'Start evolution')} →</>}</button>
      {err && <p className="text-[12px] text-vermilion">{err}</p>}
    </div>}
  </div>;
}

export function DarwinHub({gameId, games, onPickGame, locale, tab, setTab, onApplied, gameTitle}: {
  gameId: string | null; games: GameLite[]; onPickGame: (id: string) => void; locale: string; tab: HubTab; setTab: (t: HubTab) => void; onApplied: () => void; gameTitle: string;
}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const {data, reload, active} = useEvolution(gameId);
  const [runId, setRunId] = useState<string | null>(null);
  const [sid, setSid] = useState<string | null>(null);
  const runs = useMemo(() => data?.runs || [], [data]);
  const run = runs.find(r => r.id === runId) || runs[0];
  useEffect(() => { setRunId(null); setSid(null); }, [gameId]);
  const side = games.filter(g => g.mode === 'side-scroller');
  const current = side.find(g => g.id === gameId);

  if (!gameId || !current) {
    return <div className="fade-up pb-10 pt-14">
      <div className="eyebrow">{L('选择第 0 代', 'Choose generation 0')}</div>
      <h2 className="mt-4 max-w-3xl font-serif text-[44px] font-bold leading-tight">{L('从一款横版游戏开始进化', 'Start from a side-scroller')}</h2>
      <p className="mt-4 max-w-2xl text-[15px] leading-8 text-ink2">{L('进化目前面向独立的 HTML / Canvas 横版游戏。先在「工坊」一句话生成一款，或者从馆藏里挑一款作为祖先。', 'Evolution currently targets standalone HTML/Canvas side-scrollers. Generate one in the Forge, or pick an ancestor from the collection.')}</p>
      <div className="mt-10 grid border-l border-t border-ink md:grid-cols-2 xl:grid-cols-3">
        {side.map((g, i) => <button key={g.id} onClick={() => onPickGame(g.id)} className="group flex min-h-[190px] flex-col justify-between border-b border-r border-ink p-6 text-left transition hover:bg-card">
          <div>
            <div className="flex items-baseline justify-between font-mono text-[11px] text-ink3"><span>No. {String(i + 1).padStart(3, '0')}</span><span>{new Date(g.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</span></div>
            <div className="mt-4 font-serif text-[24px] font-semibold leading-snug">{g.title || g.id}</div>
            <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-ink3">{g.prompt}</div>
          </div>
          <div className="mt-5 text-[13px] font-medium transition group-hover:text-vermilion">{L('作为祖先', 'Use as ancestor')} →</div>
        </button>)}
      </div>
    </div>;
  }

  const species = run?.evolution?.species || [];
  const open = (id: string) => { setSid(id); setTab('specimen'); };
  const applyVersion = async (version: string) => {
    const v = await api(`/api/versions/${gameId}`);
    await api(`/api/versions/${gameId}`, {version, expectedVersion: v.current});
    onApplied();
  };
  const title = current.title || gameTitle;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-rule pb-5 pt-8">
      <div className="min-w-0">
        <div className="eyebrow">{L('进化中的游戏', 'Evolving game')}</div>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="truncate font-serif text-[30px] font-bold leading-tight">{title}</h1>
          {active && <span className="flex shrink-0 items-center gap-1.5 border border-vermilion px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-vermilion"><span className="breathe inline-block h-1.5 w-1.5 rounded-full bg-vermilion" />{L('进化中', 'Live')}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-[11px] text-ink3">{L('游戏', 'Game')}
          <select aria-label="game" className="field mt-1 block w-56 py-2 font-serif text-[14px]" value={gameId} onChange={e => onPickGame(e.target.value)}>
            {side.map(g => <option key={g.id} value={g.id}>{g.title || g.id}</option>)}
          </select>
        </label>
        {runs.length > 0 && <label className="block text-[11px] text-ink3">{L('进化记录', 'Run')}
          <select aria-label="run" className="field mt-1 block w-64 py-2 font-mono text-[12px]" value={run?.id} onChange={e => setRunId(e.target.value)}>
            {runs.map(r => <option key={r.id} value={r.id}>{r.id.slice(0, 8)} · {r.status} · {(r.evolution?.species || []).length} {L('物种', 'species')}</option>)}
          </select>
        </label>}
      </div>
    </div>

    {tab === 'galaxy' && <div className="relative mt-6 h-[calc(100vh-230px)] min-h-[640px]">
      {species.length > 0
        ? <Galaxy offsetLeft={340} species={species} champion={run?.evolution?.champion} focus={run?.focus} onOpen={open} locale={locale} live={active} generation={run?.evolution?.generation} likes={data?.likes} />
        : <div className="flex h-full items-center justify-center pl-0 lg:pl-[340px]"><div className="text-center">
            <svg width="120" height="120" viewBox="0 0 120 120" className="mx-auto" aria-hidden>{[20, 38, 56].map(r => <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="#1B1A17" strokeOpacity=".18" strokeDasharray="2 5" />)}<circle cx="60" cy="60" r="6" fill="#1B1A17" /></svg>
            <p className="mt-6 font-serif text-[24px] font-semibold">{L('第 0 代，等待繁衍', 'Generation 0 awaits')}</p>
            <p className="mt-2 text-[14px] text-ink3">{L('在左侧设定进化方向，开始第一次进化。', 'Set a direction on the left to start the first run.')}</p>
          </div></div>}
      <div className="pointer-events-none absolute left-0 top-0 z-10"><EvolvePanel gameId={gameId} run={run} locale={locale} onStarted={id => { setRunId(id); reload(); }} /></div>
      <div className="pointer-events-none absolute right-0 top-0 hidden w-[132px] md:block">
        <div className="eyebrow mb-2 border-b border-ink pb-1.5">{L('图例', 'Key')}</div>
        <div className="space-y-1.5">{Object.entries(GENE).filter(([k]) => k !== 'repair').map(([k, g]) => <div key={k} className="flex items-center gap-2 text-[12px] text-ink2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{background: g.color}} />{zh ? g.zh : g.en}</div>)}</div>
        <div className="mt-3 space-y-1.5 border-t border-rule pt-3 text-[12px] text-ink2">
          <div className="flex items-center gap-2"><svg width="10" height="10" aria-hidden><path d="M1 1l8 8M9 1l-8 8" stroke="#1B1A17" strokeWidth="1.3" /></svg>{L('夭折 / 崩溃', 'Dead')}</div>
          <div className="flex items-center gap-2"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="none" stroke="#B8401F" strokeWidth="1.4" /><circle cx="6" cy="6" r="2" fill="#B8401F" /></svg>{L('冠军', 'Champion')}</div>
          <div className="flex items-center gap-2"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="none" stroke="#1B1A17" strokeWidth="1" strokeDasharray="2 2" /></svg>{L('档案库精英', 'Elite')}</div>
        </div>
      </div>
    </div>}
    {tab !== 'galaxy' && !run && <div className="py-24 text-center text-[14px] text-ink3">{L('还没有进化记录。', 'No evolution yet.')} <button className="link text-ink" onClick={() => setTab('galaxy')}>{L('去谱系页开始一次进化', 'Start one from the lineage')}</button></div>}
    <div className="pt-8">
    {tab === 'specimen' && run && (() => {
      const target = sid && species.find(s => s.id === sid) ? sid : run.evolution?.champion || species[0]?.id;
      return target ? <Specimen run={run} sid={target} gameId={gameId} locale={locale} likes={data?.likes || {}} onLike={reload} onApply={applyVersion} onOpen={open} onClose={() => setTab('galaxy')} onObserve={() => setTab('observatory')} /> : null;
    })()}
    {tab === 'cabinet' && run && <Cabinet run={run} gameId={gameId} locale={locale} onOpen={open} />}
    {tab === 'observatory' && run && data && <Observatory run={run} gameId={gameId} locale={locale} people={data.personas.people} archetypes={data.personas.archetypes} sid={sid} onSelect={setSid} onOpen={open} />}
    {tab === 'method' && <Method runs={run ? [run, ...runs.filter(r => r !== run)] : runs} likes={data?.likes || {}} locale={locale} />}
    </div>
  </div>;
}
