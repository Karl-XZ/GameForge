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

function EvolvePanel({gameId, run, runs, onRun, locale, onStarted, title}: {gameId: string; run?: Run; runs: Run[]; onRun: (id: string) => void; locale: string; onStarted: (id: string) => void; title: string}) {
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
  const phases = ['baseline', 'design', 'build', 'play', 'review', 'society', 'select'];
  return <div className="pointer-events-auto w-[340px] space-y-4 rounded-2xl glass p-5 shadow-2xl">
    <div>
      <div className="label-mono">{L('达尔文进化', 'Darwin evolution')}</div>
      <div className="mt-1 line-clamp-2 font-serif text-xl text-white">{title}</div>
    </div>
    {runs.length > 0 && <select aria-label="run" className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 font-mono text-xs" value={run?.id} onChange={e => onRun(e.target.value)}>
      {runs.map(r => <option key={r.id} value={r.id}>{r.id.slice(0, 8)} · {r.status} · {(r.evolution?.species || []).length} {L('物种', 'species')}</option>)}
    </select>}
    {run && <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-xs"><span className={active ? 'text-primary' : run.status === 'failed' ? 'text-rose' : 'text-text'}>{active ? '● ' : ''}{(PHASE[run.phase] || [run.phase, run.phase])[zh ? 0 : 1]}</span><span className="text-muted">{L('第', 'GEN')} {evo?.generation ?? 0}/{evo?.generations ?? run.budgets.generations} {L('代', '')}</span></div>
      <div className="flex gap-1">{phases.map(p => <div key={p} className={`h-1 flex-1 rounded-full ${run.phase === p && active ? 'scanline relative overflow-hidden bg-primary/60' : phases.indexOf(p) < phases.indexOf(run.phase) || run.status === 'completed' ? 'bg-primary/50' : 'bg-white/10'}`} />)}</div>
      {focus && active && <div className="text-sm text-text/80">{L('正在处理', 'Working on')} <span style={{color: geneOf(focus.gene).color}}>●</span> <span className="font-serif text-white">{focus.name || focus.id}</span> <span className="text-muted">({zh ? geneOf(focus.gene).zh : geneOf(focus.gene).en})</span></div>}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[[L('物种', 'Species'), evo?.species.length ?? 0], [L('存活', 'Alive'), evo?.species.filter(s => s.status === 'alive').length ?? 0], [L('调用', 'Calls'), `${run.calls?.length ?? 0}/${run.budgets.calls}`]].map(([k, v]) => <div key={k as string} className="rounded-lg border border-border py-2"><div className="font-serif text-xl text-white">{v}</div><div className="label-mono text-[9px]">{k}</div></div>)}
      </div>
      {run.error && <p className="text-xs text-rose">{run.error}</p>}
      {run.status === 'completed' && <p className="text-xs text-muted">{run.outcome === 'evolved_proxy' && run.evolution?.champion !== 's0r' ? L('冠军已赢下双盲评，可在标本卡试玩并选用。', 'Champion won both blind reviews; play and apply it from its specimen card.') : run.outcome === 'repaired' || run.evolution?.champion === 's0r' ? L('原版在真实试玩中崩溃，修复突变让它重新可玩；后代暂未赢下双盲评。', 'The original crashed in real play; a repair mutation made it playable. No offspring won both reviews yet.') : L('没有后代赢下双盲评，保留原始物种。', 'No offspring won both reviews; the original is retained.')}</p>}
      <div className="flex gap-2">
        {active && <button className="flex-1 rounded-lg border border-border py-2 text-sm hover:border-rose/60" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'stop'})}>{L('停止', 'Stop')}</button>}
        {run && ['stopped', 'failed'].includes(run.status) && <button className="flex-1 rounded-lg border border-border py-2 text-sm hover:border-primary/60" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'resume'})}>{L('从检查点恢复', 'Resume')}</button>}
        {!active && <button className="flex-1 rounded-lg border border-border py-2 text-sm hover:border-primary/60" onClick={() => setOpen(!open)}>{open ? L('收起', 'Hide') : L('新一轮进化', 'New run')}</button>}
      </div>
    </div>}
    {(open || !run) && !active && <div className="space-y-3">
      <label className="block text-xs text-muted">{L('进化方向（自然选择压力）', 'Direction (selection pressure)')}<textarea className="mt-1 w-full rounded-lg border border-border bg-panel2 p-2 text-sm text-text" rows={3} value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        {([[L('代数', 'Generations'), gens, setGens, 1, 5], [L('每代后代', 'Children/gen'), kids, setKids, 1, 3], [L('模型调用上限', 'Call budget'), calls, setCalls, 8, 80], [L('分钟上限', 'Minutes'), minutes, setMinutes, 5, 90]] as const).map(([l, v, set, min, max]) =>
          <label key={l as string}>{l}<input type="number" min={min} max={max} value={v as number} onChange={e => (set as any)(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2 py-1.5 font-mono text-text" /></label>)}
      </div>
      <div className="text-[11px] text-muted">{L(`预计 ≈ ${2 + gens * kids * 6} 次调用：每个后代 = 设计 + 制作 + 试玩策略 + 社会推演 + 2 次盲评。`, `≈ ${2 + gens * kids * 6} calls: each child = design + build + player + society + 2 reviews.`)}</div>
      <button disabled={busy} onClick={start} className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-[#04211c] shadow-teal hover:brightness-110 disabled:opacity-50">{busy ? '…' : L('开始进化', 'Start evolution')}</button>
      {err && <p className="text-xs text-rose">{err}</p>}
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
  if (!gameId || !games.find(g => g.id === gameId && g.mode === 'side-scroller')) {
    return <div className="fade-up py-10">
      <div className="label-mono">{L('选择第 0 代', 'Choose generation 0')}</div>
      <h2 className="mt-2 font-serif text-4xl text-white">{L('从一款 GameForge 横版游戏开始进化', 'Start from a GameForge side-scroller')}</h2>
      <p className="mt-3 max-w-2xl text-muted">{L('进化当前面向独立 HTML / Canvas 横版游戏。先在「工坊」一句话生成，或从下面选择一款。', 'Evolution currently targets standalone HTML/Canvas side-scrollers. Generate one in the Forge, or pick one below.')}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">{side.map(g => <button key={g.id} onClick={() => onPickGame(g.id)} className="rounded-2xl glass p-5 text-left transition hover:border-primary/50"><div className="font-serif text-xl text-white">{g.title || g.id}</div><div className="mt-2 line-clamp-2 text-sm text-muted">{g.prompt}</div><div className="mt-3 font-mono text-[11px] text-muted">{g.id} · {new Date(g.createdAt).toLocaleString()}</div></button>)}</div>
    </div>;
  }
  const species = run?.evolution?.species || [];
  const open = (id: string) => { setSid(id); setTab('specimen'); };
  const applyVersion = async (version: string) => {
    const v = await api(`/api/versions/${gameId}`);
    await api(`/api/versions/${gameId}`, {version, expectedVersion: v.current});
    onApplied();
  };
  return <div>
    {tab === 'galaxy' && <div className="relative h-[calc(100vh-150px)] min-h-[620px]">
      {species.length > 0 ? <Galaxy offsetLeft={360} species={species} champion={run?.evolution?.champion} focus={run?.focus} onOpen={open} locale={locale} live={active} generation={run?.evolution?.generation} likes={data?.likes} /> :
        <div className="flex h-full items-center justify-center"><div className="text-center"><div className="mx-auto h-3 w-3 rounded-full bg-white shadow-[0_0_40px_#5eead4]" /><p className="mt-6 font-serif text-2xl text-white">{L('第 0 代等待被观测', 'Generation 0 awaits')}</p><p className="mt-2 text-muted">{L('在左侧设定进化方向，开始第一次进化。', 'Set a direction on the left and start the first run.')}</p></div></div>}
      <div className="pointer-events-none absolute left-0 top-0"><EvolvePanel gameId={gameId} run={run} runs={runs} onRun={id => setRunId(id)} locale={locale} onStarted={id => { setRunId(id); reload(); }} title={gameTitle} /></div>
      <div className="pointer-events-none absolute right-0 top-0 space-y-1 text-right">{Object.entries(GENE).filter(([k]) => k !== 'repair').map(([k, g]) => <div key={k} className="label-mono text-[10px]"><span style={{color: g.color}}>●</span> {zh ? g.zh : g.en}</div>)}
        <div className="label-mono pt-2 text-[10px]">✕ {L('夭折 / 崩溃', 'dead')}</div><div className="label-mono text-[10px] text-amber">◌ {L('冠军', 'champion')}</div></div>
    </div>}
    {tab !== 'galaxy' && !run && <div className="py-24 text-center text-muted">{L('还没有进化记录。先在「星系」开始一次进化。', 'No evolution yet. Start one from the Galaxy.')} <button className="text-primary underline" onClick={() => setTab('galaxy')}>{L('去星系', 'Go')}</button></div>}
    {tab === 'specimen' && run && (() => {
      const target = sid && species.find(s => s.id === sid) ? sid : run.evolution?.champion || species[0]?.id;
      return target ? <Specimen run={run} sid={target} gameId={gameId} locale={locale} likes={data?.likes || {}} onLike={reload} onApply={applyVersion} onOpen={open} onClose={() => setTab('galaxy')} onObserve={() => setTab('observatory')} /> : null;
    })()}
    {tab === 'cabinet' && run && <Cabinet run={run} gameId={gameId} locale={locale} onOpen={open} />}
    {tab === 'observatory' && run && data && <Observatory run={run} gameId={gameId} locale={locale} people={data.personas.people} archetypes={data.personas.archetypes} sid={sid} onSelect={setSid} onOpen={open} />}
    {tab === 'method' && <Method runs={run ? [run, ...runs.filter(r => r !== run)] : runs} likes={data?.likes || {}} locale={locale} />}
  </div>;
}
