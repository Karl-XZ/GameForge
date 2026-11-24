'use client';
import {useState} from 'react';
import {api, evidenceUrl, fmt, geneOf, pct, speciesUrl, type Run, type Species} from './common';

export function Radar({values, labels, color = '#5eead4', size = 230}: {values: number[]; labels: string[]; color?: string; size?: number}) {
  const c = size / 2, R = size * 0.36; const n = values.length;
  const pt = (i: number, r: number) => [c + Math.sin((i / n) * Math.PI * 2) * r, c - Math.cos((i / n) * Math.PI * 2) * r];
  const poly = values.map((v, i) => pt(i, R * Math.max(0.04, Math.min(1, v))).join(',')).join(' ');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
    {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} points={values.map((_, i) => pt(i, R * k).join(',')).join(' ')} fill="none" stroke="rgba(148,163,184,0.16)" />)}
    {values.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(148,163,184,0.14)" />; })}
    <polygon points={poly} fill={color + '33'} stroke={color} strokeWidth={1.8} />
    {values.map((v, i) => { const [x, y] = pt(i, R * Math.max(0.04, Math.min(1, v))); return <circle key={i} cx={x} cy={y} r={3} fill={color} />; })}
    {labels.map((l, i) => { const [x, y] = pt(i, R + 20); return <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="#8593a6" fontFamily="'Noto Serif SC', serif">{l}</text>; })}
  </svg>;
}

export function lineageOf(species: Species[], s: Species) {
  const out: Species[] = []; let cur: Species | undefined = s;
  while (cur) { out.unshift(cur); cur = species.find(x => x.id === cur!.parent); }
  return out;
}

export function Specimen({run, sid, gameId, locale, likes, onLike, onApply, onOpen, onClose, onObserve}: {
  run: Run; sid: string; gameId: string; locale: string; likes: Record<string, number>; onLike: () => void; onApply: (version: string) => Promise<void>;
  onOpen: (sid: string) => void; onClose: () => void; onObserve: () => void;
}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const species = run.evolution?.species || []; const s = species.find(x => x.id === sid);
  const [view, setView] = useState<'play' | 'video' | 'frames'>('play');
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  if (!s) return null;
  const gene = geneOf(s.gene); const parent = species.find(x => x.id === s.parent);
  const kids = species.filter(x => x.parent === s.id);
  const lineage = lineageOf(species, s);
  const version = run.versions?.[s.id];
  const like = likes[`${run.id}:${s.id}`] || 0;
  const f = s.fitness;
  const champion = run.evolution?.champion === s.id;
  const playable = !!s.sourceHash && s.status !== 'stillborn';
  const video = s.play?.video ? `${s.evidence}/${s.play.video}` : null;
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(''); try { await fn(); } catch (e) { setMsg(String(e)); } finally { setBusy(''); } };
  return <div className="fade-up grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[#05080d] shadow-glow">
        <div className="aspect-video w-full">
          {view === 'play' && playable && <iframe key={s.id} title={s.name} className="h-full w-full" sandbox="allow-scripts allow-pointer-lock" src={speciesUrl(gameId, run.id, s.id)} />}
          {view === 'video' && video && <video key={video} className="h-full w-full object-contain" src={evidenceUrl(gameId, run.id, video)} controls autoPlay muted loop />}
          {view === 'frames' && <div className="grid h-full grid-cols-5 gap-1 p-1">{(s.frames || []).slice(0, 10).map(fr => (
            // eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames
            <img key={fr} alt="" className="h-full w-full object-cover" src={evidenceUrl(gameId, run.id, fr)} />))}</div>}
          {!playable && <div className="flex h-full items-center justify-center p-8 text-center text-muted">{s.error || L('这个物种在制作阶段夭折，没有可玩的版本。', 'This species was stillborn; there is no playable build.')}</div>}
        </div>
        <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[11px] text-text/80">{s.id} · {L(`第 ${s.gen} 代`, `GEN ${s.gen}`)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {([['play', L('实机试玩', 'Play live')], ['video', L('AI 试玩录像', 'AI playtest video')], ['frames', L('真实截图帧', 'Real frames')]] as const).map(([k, label]) =>
          <button key={k} onClick={() => setView(k)} disabled={(k === 'video' && !video) || (k === 'play' && !playable)}
            className={`label-mono rounded-md border px-3 py-2 ${view === k ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted hover:text-text'} disabled:opacity-30`}>{label}</button>)}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-6">
        <div>
          <div className="label-mono mb-1">{L('适应度', 'Fitness')}</div>
          <Radar values={[f?.review ?? 0, f?.social ?? 0, f?.progress ?? 0, f?.novelty ?? 0, s.metrics?.challenge ?? 0]} labels={[L('盲评', 'Review'), L('社会', 'Society'), L('进度', 'Progress'), L('新颖', 'Novelty'), L('挑战', 'Challenge')]} color={gene.color} />
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border">
          {[[L('综合 F', 'Fitness F'), fmt(f?.F)], [L('社会分', 'Society S'), fmt(s.society?.S)], [L('盲评得票', 'Blind votes'), f ? `${Math.round((f.review ?? 0) * 2 * 10) / 10}/2` : '—'],
            [L('最远进度', 'Progress'), pct(s.metrics?.progress)], [L('留存率', 'Retention'), pct(s.society?.metrics?.retention)], [L('真人点赞', 'Human likes'), String(like)]].map(([k, v]) =>
            <div key={k} className="border-b border-r border-border p-4 [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0">
              <div className="label-mono text-[10px]">{k}</div><div className="mt-2 font-serif text-3xl text-text">{v}</div>
            </div>)}
        </div>
      </div>
    </div>

    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="label-mono leading-6">{run.id.slice(0, 8)} · {L(`第 ${s.gen} 代`, `GEN ${s.gen}`)} · <span style={{color: gene.color}}>{L('基因', 'GENE')} {zh ? gene.zh : gene.en}</span>
          {s.cell && <> · {L('档案格', 'CELL')} {s.cell.join('-')}</>}{s.elite && <> · {L('档案库精英', 'ELITE')}</>}{champion && <span className="text-amber"> · {L('当前冠军', 'CHAMPION')}</span>}</div>
        <button className="label-mono shrink-0 hover:text-text" onClick={onClose}>× {L('回到星系', 'Back to galaxy')}</button>
      </div>
      <div>
        <h2 className="font-serif text-6xl font-semibold leading-tight tracking-wide text-white">{s.name || s.id}</h2>
        <div className="mt-1 font-serif text-lg italic text-text/60" style={{fontFamily: 'Georgia, serif'}}>{s.latin}</div>
      </div>
      <p className="font-serif text-lg leading-8 text-text/90">{s.hypothesis}</p>
      <div>
        <div className="label-mono mb-2">{L('基因条码', 'Gene barcode')} · {L(`${lineage.length} 代血统`, `${lineage.length} generations`)}</div>
        <div className="flex h-14 overflow-hidden rounded-md">
          {lineage.map(x => <button key={x.id} title={x.name} onClick={() => onOpen(x.id)} className="flex-1 border-r-2 border-[#070b12] transition hover:brightness-125" style={{background: x.gene === 'origin' ? 'repeating-linear-gradient(45deg,#e8edf3 0 6px,#070b12 6px 12px)' : geneOf(x.gene).color, outline: x.id === s.id ? '2px solid #fff' : 'none', outlineOffset: -2}} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{lineage.map(x => <span key={x.id}><span className="mr-1 inline-block rounded px-1 font-mono text-[10px] text-[#070b12]" style={{background: geneOf(x.gene).color}}>{geneOf(x.gene).glyph}</span>{x.name || x.id}</span>)}</div>
      </div>
      {(s.changes?.length || s.summary) && <div>
        <div className="label-mono mb-2">{parent ? L(`相比亲本「${parent.name || parent.id}」`, `Versus parent “${parent.name || parent.id}”`) : L('变异内容', 'Mutation')}</div>
        <div className="space-y-1 font-mono text-[13px] leading-6">
          {(s.changes || []).map((c, i) => <div key={i} className="text-[#7ef0c2]">+ {c}</div>)}
          {s.summary && <div className="text-muted">⟶ {s.summary}</div>}
          {s.error && <div className="text-rose line-through decoration-rose/50">{s.error}</div>}
        </div>
      </div>}
      {!!s.reviews?.length && <div>
        <div className="label-mono mb-2">{L('双顺序盲评（不提供源码与新旧顺序）', 'Reversed blind reviews (no source, no order)')}</div>
        <div className="grid gap-2 sm:grid-cols-2">{s.reviews.map(r => {
          const won = (r.order === 'A/B' && r.winner === 'B') || (r.order === 'B/A' && r.winner === 'A');
          return <div key={r.order} className={`rounded-xl border p-3 text-sm ${won ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
            <div className="label-mono mb-1 flex justify-between"><span>{r.order}</span><span className={won ? 'text-primary' : 'text-rose'}>{won ? L('偏好后代', 'Prefers child') : r.winner === 'tie' ? L('平局', 'Tie') : r.winner === 'unavailable' ? L('证据不足', 'Unavailable') : L('偏好亲本', 'Prefers parent')}</span></div>
            <p className="line-clamp-4 text-text/80">{r.reason}</p>
          </div>;
        })}</div>
        <div className="mt-2 text-xs text-muted">{s.promoted ? L('两次盲评都偏好后代，且引用了真实证据路径 → 允许成为冠军。', 'Both reviews prefer the child with valid evidence → eligible as champion.') : L('未同时赢得两次盲评 → 仅作为档案保留，不能直接成为冠军。', 'Did not win both reviews → archived, not eligible as champion.')}</div>
      </div>}
      {!!s.society?.posts?.length && <div>
        <div className="label-mono mb-2 flex justify-between"><span>{L('玩家社会 · 帖子', 'Player society · posts')}</span><button className="hover:text-text" onClick={onObserve}>{L('进入观察台 →', 'Observatory →')}</button></div>
        <p className="mb-2 font-serif text-text/80">“{s.society.summary}”</p>
        <div className="max-h-56 space-y-2 overflow-auto pr-2">{s.society.posts.slice(0, 6).map(p => <div key={p.persona} className="flex gap-3 rounded-xl border border-border p-3 text-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[#070b12]" style={{background: p.stay ? '#5eead4' : '#ff6b9a'}}>{p.name.slice(0, 1)}</div>
          <div className="min-w-0"><div className="text-xs text-muted">{p.name} · {p.archLabel} · {L(`第 ${p.day} 天`, `Day ${p.day}`)} · <span className="text-amber">{'★'.repeat(p.rating)}{'☆'.repeat(5 - p.rating)}</span> {p.stay ? '' : `· ${L('弃坑', 'quit')}`}</div><div className="text-text/90">{p.text}</div></div>
        </div>)}</div>
      </div>}
      {kids.length > 0 && <div><div className="label-mono mb-2">{L('后代', 'Offspring')}</div><div className="flex flex-wrap gap-2">{kids.map(k => <button key={k.id} onClick={() => onOpen(k.id)} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50"><span style={{color: geneOf(k.gene).color}}>●</span> {k.name || k.id} <span className="font-mono text-xs text-muted">F {fmt(k.fitness?.F)}</span></button>)}</div></div>}
      <div className="flex flex-wrap gap-3 pt-2">
        <button disabled={s.status !== 'alive' || !!busy} onClick={() => act('like', async () => { await api(`/api/evolve/${gameId}/${run.id}/like`, {species: s.id}); onLike(); })} className="rounded-lg border border-rose/50 px-5 py-3 text-sm text-rose hover:bg-rose/10 disabled:opacity-40">♥ {L('自然选择它', 'Select it')} · {like}</button>
        {version && <button disabled={!!busy} onClick={() => act('apply', () => onApply(version))} className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-[#04211c] shadow-teal hover:brightness-110 disabled:opacity-40">✓ {L('选用此版本', 'Apply this version')}</button>}
        {version && <a className="rounded-lg border border-border px-5 py-3 text-sm hover:border-primary/50" href={`/api/export/${gameId}?version=${version}`}>⤓ {L('离线 ZIP', 'Offline ZIP')}</a>}
        {!version && s.status === 'alive' && <span className="self-center text-xs text-muted">{L('进化结束后可选用与导出', 'Apply/export after the run finishes')}</span>}
      </div>
      {msg && <p className="text-sm text-rose">{msg}</p>}
    </div>
  </div>;
}
