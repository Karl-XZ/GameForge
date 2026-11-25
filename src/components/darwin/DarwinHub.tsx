'use client';
import {useEffect, useMemo, useState} from 'react';
import {ACTIVE, api, GENE, geneOf, PHASE, SWATCH, type Run, useEvolution} from './common';
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
  const lab = 'block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet';
  return <div className="pointer-events-auto w-[320px] border-[3px] border-jet bg-snow shadow-hard-red">
    {run && <div>
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${run.status === 'failed' ? 'bg-volt text-jet' : 'bg-jet text-snow'}`}>
        <span className="heavy flex items-center gap-2 text-[15px]">
          {active && <span className="breathe inline-block h-2.5 w-2.5 rotate-45 bg-pop" />}
          {(PHASE[run.phase] || [run.phase, run.phase])[zh ? 0 : 1]}
        </span>
        <span className="font-display text-[15px] num">{L('第', 'GEN')} {evo?.generation ?? 0}/{evo?.generations ?? run.budgets.generations}{L(' 代', '')}</span>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-7 gap-1.5 px-1" aria-hidden>
          {PHASES.map((p, i) => <div key={p} className={`h-2.5 -skew-x-[20deg] ${active && i === phaseIdx ? 'marching' : run.status === 'completed' || i < phaseIdx ? 'bg-jet' : 'bg-fog'}`} />)}
        </div>
        {focus && active && <div className="text-[13px] text-ink2">{L('正在处理', 'Working on')} <span className="heavy text-jet">{focus.name || focus.id}</span> <span className="text-ink3">· {zh ? geneOf(focus.gene).zh : geneOf(focus.gene).en}</span></div>}
        <div className="grid grid-cols-3 gap-2">
          {[[L('物种', 'Species'), evo?.species.length ?? 0], [L('存活', 'Alive'), evo?.species.filter(s => s.status === 'alive').length ?? 0], [L('调用', 'Calls'), `${run.calls?.length ?? 0}`]].map(([k, v], i) =>
            <div key={i} className={`-skew-x-[6deg] border-[2.5px] border-jet px-2.5 py-2 ${i === 1 ? 'bg-pop text-snow' : 'bg-snow'}`}><div className="skew-x-[6deg]"><div className="font-display text-[30px] leading-none num">{v}</div><div className={`mt-1 text-[11px] font-semibold ${i === 1 ? 'text-snow/80' : 'text-ink3'}`}>{k}{i === 2 ? ` / ${run.budgets.calls}` : ''}</div></div></div>)}
        </div>
        {run.error && <p className="border-l-[4px] border-pop pl-2 text-[12px] leading-5 text-pop">{run.error}</p>}
        {outcome && <p className="bg-bone p-2.5 text-[13px] leading-6 text-ink2">{outcome}</p>}
        <div className="flex gap-3 pl-1">
          {active && <button className="btn-quiet flex-1" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'stop'})}>{L('停止', 'Stop')}</button>}
          {['stopped', 'failed'].includes(run.status) && <button className="btn-quiet flex-1" onClick={() => api(`/api/improve/${gameId}/${run.id}`, {action: 'resume'})}>{L('从检查点恢复', 'Resume')}</button>}
          {!active && <button className="btn-line flex-1" onClick={() => setOpen(!open)}>{open ? L('收起', 'Hide') : L('新一轮进化', 'New run')}</button>}
        </div>
      </div>
    </div>}
    {(open || !run) && !active && <div className={`space-y-4 p-4 ${run ? 'border-t-[3px] border-jet bg-bone' : ''}`}>
      {!run && <div className="heavy slant text-[20px]">{L('开始第一次进化', 'Start the first run')}</div>}
      <label className={lab}>{L('进化方向（选择压力）', 'Direction (selection pressure)')}<textarea className="field mt-2 font-sans text-[14px] font-normal normal-case leading-7 tracking-normal" rows={3} value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        {([[L('代数', 'Generations'), gens, setGens, 1, 5], [L('每代后代', 'Children/gen'), kids, setKids, 1, 3], [L('调用上限', 'Call budget'), calls, setCalls, 8, 80], [L('分钟上限', 'Minutes'), minutes, setMinutes, 5, 90]] as const).map(([l, v, set, min, max]) =>
          <label key={l as string} className={lab}>{l}<input type="number" min={min} max={max} value={v as number} onChange={e => (set as any)(Number(e.target.value))} className="field mt-1.5 py-2 font-mono" /></label>)}
      </div>
      <p className="text-[11px] leading-5 text-ink3">{L(`预计约 ${2 + gens * kids * 6} 次调用。每个后代：设计、制作、试玩策略、社会推演，加 2 次盲评。`, `About ${2 + gens * kids * 6} calls. Each child: design, build, player policy, society, plus 2 reviews.`)}</p>
      <button disabled={busy} onClick={start} className="btn-red w-full py-3.5 text-[18px]">{busy ? '…' : <>{L('开始进化', 'Start evolution')} →</>}</button>
      {err && <p className="text-[12px] font-semibold text-pop">{err}</p>}
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
    return <div className="pb-10 pt-12">
      <div className="tag tag-white"><span>{L('选择第 0 代', 'Choose generation 0')}</span></div>
      <h2 className="shout mt-6 max-w-4xl -skew-x-[6deg] text-[42px] leading-[1.1] md:text-[64px]">{L('从一款横版游戏开始进化', 'Start from a side-scroller')}</h2>
      <p className="mt-6 max-w-2xl bg-jet px-4 py-3 text-[15px] leading-7 text-snow/85">{L('进化目前面向独立的 HTML / Canvas 横版游戏。先在「工坊」一句话生成一款，或者从作品库里挑一款作为祖先。', 'Evolution currently targets standalone HTML/Canvas side-scrollers. Generate one in the Forge, or pick an ancestor from the library.')}</p>
      <div className="stagger mt-12 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
        {side.map((g, i) => <button key={g.id} onClick={() => onPickGame(g.id)} className={`group relative flex min-h-[210px] flex-col justify-between border-[3px] border-jet bg-snow p-6 text-left shadow-hard transition duration-200 hover:-translate-y-1 hover:rotate-0 hover:bg-volt hover:shadow-hard-lg ${i % 2 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]'}`}>
          <div>
            <div className="flex items-center justify-between"><span className="font-display text-[40px] leading-none text-pop num">{String(i + 1).padStart(2, '0')}</span><span className="font-mono text-[11px] text-ink3">{new Date(g.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</span></div>
            <div className="heavy mt-3 text-[24px] leading-snug">{g.title || g.id}</div>
            <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-ink2">{g.prompt}</div>
          </div>
          <div className="mt-5 self-start"><span className="tag tag-red text-[14px] transition group-hover:bg-jet"><span>{L('作为祖先', 'Use as ancestor')} →</span></span></div>
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
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-7 pt-10">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="tag"><span>{L('进化中的游戏', 'Evolving game')}</span></span>
          {active && <span className="tag tag-volt"><span className="breathe inline-block h-2 w-2 rotate-45 bg-pop" /><span>{L('进化中', 'LIVE')}</span></span>}
        </div>
        <h1 className="shout mt-4 max-w-[900px] -skew-x-[6deg] truncate text-[36px] leading-[1.1] md:text-[50px]">{title}</h1>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block font-cond text-[13px] font-bold uppercase tracking-[0.08em] text-snow">{L('游戏', 'Game')}
          <select aria-label="game" className="field mt-1.5 block w-56 py-2 font-sans text-[14px] font-semibold normal-case tracking-normal shadow-hard" value={gameId} onChange={e => onPickGame(e.target.value)}>
            {side.map(g => <option key={g.id} value={g.id}>{g.title || g.id}</option>)}
          </select>
        </label>
        {runs.length > 0 && <label className="block font-cond text-[13px] font-bold uppercase tracking-[0.08em] text-snow">{L('进化记录', 'Run')}
          <select aria-label="run" className="field mt-1.5 block w-64 py-2 font-mono text-[12px] normal-case tracking-normal shadow-hard" value={run?.id} onChange={e => setRunId(e.target.value)}>
            {runs.map(r => <option key={r.id} value={r.id}>{r.id.slice(0, 8)} · {r.status} · {(r.evolution?.species || []).length} {L('物种', 'species')}</option>)}
          </select>
        </label>}
      </div>
    </div>

    {tab === 'galaxy' && <div className="fade-up relative h-[calc(100vh-250px)] min-h-[660px] overflow-hidden border-[3px] border-jet bg-jet shadow-hard-lg">
      <div className="halftone-red pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_58%_48%,black_0%,transparent_62%)]" />
      <div className="pointer-events-none absolute -right-24 top-0 h-full w-[38%] -skew-x-[16deg] bg-snow/[0.035]" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-[30%] -rotate-[10deg] bg-pop/85" />
      {species.length > 0
        ? <Galaxy offsetLeft={352} species={species} champion={run?.evolution?.champion} focus={run?.focus} onOpen={open} locale={locale} live={active} generation={run?.evolution?.generation} likes={data?.likes} />
        : <div className="relative flex h-full items-center justify-center pl-0 lg:pl-[352px]"><div className="text-center text-snow">
            <svg width="140" height="140" viewBox="0 0 140 140" className="spin-slow mx-auto" aria-hidden><path d="M70 6l12 34 36-8-24 28 30 20-36 4 4 36-22-28-22 28 4-36-36-4 30-20-24-28 36 8z" fill="#E8132E" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" /><circle cx="70" cy="72" r="12" fill="#FFFFFF" stroke="#0B0B0D" strokeWidth="3" /></svg>
            <p className="heavy slant mt-6 text-[30px]">{L('第 0 代，等待繁衍', 'Generation 0 awaits')}</p>
            <p className="mt-3 text-[14px] text-snow/60">{L('在左侧设定进化方向，开始第一次进化。', 'Set a direction on the left to start the first run.')}</p>
          </div></div>}
      <div className="pointer-events-none absolute left-4 top-4 z-10"><EvolvePanel gameId={gameId} run={run} locale={locale} onStarted={id => { setRunId(id); reload(); }} /></div>
      <div className="pointer-events-none absolute right-4 top-4 hidden w-[138px] text-snow md:block">
        <div className="tag tag-white mb-3"><span>{L('图例', 'Key')}</span></div>
        <div className="space-y-2">{Object.entries(GENE).filter(([k]) => k !== 'repair').map(([k, g]) => <div key={k} className="flex items-center gap-2.5 text-[13px] font-semibold"><span className={SWATCH} style={{background: g.color, borderColor: '#FFFFFF'}} />{zh ? g.zh : g.en}</div>)}</div>
        <div className="mt-4 space-y-2 border-t-2 border-snow/20 pt-3 text-[13px] font-semibold">
          <div className="flex items-center gap-2.5"><svg width="12" height="12" aria-hidden><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="#E8132E" strokeWidth="3" /></svg>{L('夭折 / 崩溃', 'Dead')}</div>
          <div className="flex items-center gap-2.5"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7 0l1.8 4.2L13 3l-2.6 3.4L14 9l-4.4.2L10 14 7 10.6 4 14l.4-4.8L0 9l3.6-2.6L1 3l4.2 1.2z" fill="#FFE135" /></svg>{L('冠军', 'Champion')}</div>
          <div className="flex items-center gap-2.5"><svg width="14" height="14" aria-hidden><circle cx="7" cy="7" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeDasharray="2.5 2" /></svg>{L('档案库精英', 'Elite')}</div>
        </div>
      </div>
    </div>}
    {tab !== 'galaxy' && !run && <div className="plate mx-auto mt-6 max-w-xl py-14 text-center text-[15px] text-ink2">{L('还没有进化记录。', 'No evolution yet.')} <button className="link text-jet" onClick={() => setTab('galaxy')}>{L('去谱系页开始一次进化', 'Start one from the lineage')}</button></div>}
    <div className="pt-2">
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
