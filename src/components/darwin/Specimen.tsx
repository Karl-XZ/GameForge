'use client';
import {useState} from 'react';
import {api, evidenceUrl, fmt, geneOf, pct, speciesUrl, type Run, type Species} from './common';

export function Radar({values, labels, color = '#1B1A17', size = 230}: {values: number[]; labels: string[]; color?: string; size?: number}) {
  const c = size / 2, R = size * 0.34; const n = values.length;
  const pt = (i: number, r: number) => [c + Math.sin((i / n) * Math.PI * 2) * r, c - Math.cos((i / n) * Math.PI * 2) * r];
  const poly = values.map((v, i) => pt(i, R * Math.max(0.04, Math.min(1, v))).join(',')).join(' ');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
    {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} points={values.map((_, i) => pt(i, R * k).join(',')).join(' ')} fill="none" stroke="#1B1A17" strokeOpacity={k === 1 ? 0.45 : 0.12} />)}
    {values.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#1B1A17" strokeOpacity={0.12} />; })}
    <polygon points={poly} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    {values.map((v, i) => { const [x, y] = pt(i, R * Math.max(0.04, Math.min(1, v))); return <circle key={i} cx={x} cy={y} r={2.6} fill="#F2EEE4" stroke={color} strokeWidth={1.4} />; })}
    {labels.map((l, i) => { const [x, y] = pt(i, R + 22); return <g key={l}><text x={x} y={y} textAnchor="middle" fontSize={12} fill="#45423B" fontFamily="'Noto Serif SC', serif">{l}</text><text x={x} y={y + 13} textAnchor="middle" fontSize={10} fill="#7A7466" fontFamily="'IBM Plex Mono', monospace">{fmt(values[i])}</text></g>; })}
  </svg>;
}

export function lineageOf(species: Species[], s: Species) {
  const out: Species[] = []; let cur: Species | undefined = s;
  while (cur) { out.unshift(cur); cur = species.find(x => x.id === cur!.parent); }
  return out;
}

export const Stars = ({n}: {n: number}) => <span className="tracking-[0.1em] text-ochre">{'★'.repeat(n)}<span className="text-rule">{'★'.repeat(Math.max(0, 5 - n))}</span></span>;

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
  const verdict = (r: {order: string; winner: string}) => {
    const won = (r.order === 'A/B' && r.winner === 'B') || (r.order === 'B/A' && r.winner === 'A');
    if (won) return [L('偏好后代', 'Prefers child'), 'text-verdigris'];
    if (r.winner === 'tie') return [L('平局', 'Tie'), 'text-ink3'];
    if (r.winner === 'unavailable') return [L('证据不足', 'Unavailable'), 'text-ink3'];
    return [L('偏好亲本', 'Prefers parent'), 'text-vermilion'];
  };

  return <div className="fade-up">
    <div className="mb-6 flex items-center justify-between gap-4 font-mono text-[11px] text-ink3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink">{L('标本', 'Specimen')} No. {s.id}</span>
        <span>·</span><span>{L(`第 ${s.gen} 代`, `Generation ${s.gen}`)}</span>
        <span>·</span><span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{background: gene.color}} />{L('基因', 'Gene')} {zh ? gene.zh : gene.en}</span>
        {s.cell && <><span>·</span><span>{L('档案格', 'Cell')} {s.cell.join('-')}</span></>}
        {s.elite && <span className="border border-ink/60 px-1.5 text-ink">{L('档案库精英', 'Elite')}</span>}
        {champion && <span className="border border-vermilion px-1.5 text-vermilion">{L('当前冠军', 'Champion')}</span>}
      </div>
      <button className="shrink-0 transition hover:text-ink" onClick={onClose}>← {L('回到谱系', 'Back to lineage')}</button>
    </div>

    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <div className="space-y-10">
        <figure>
          <div className="relative border border-ink bg-ink p-[6px] shadow-plate">
            <div className="aspect-video w-full bg-[#111]">
              {view === 'play' && playable && <iframe key={s.id} title={s.name} className="h-full w-full" sandbox="allow-scripts allow-pointer-lock" src={speciesUrl(gameId, run.id, s.id)} />}
              {view === 'video' && video && <video key={video} className="h-full w-full object-contain" src={evidenceUrl(gameId, run.id, video)} controls autoPlay muted loop />}
              {view === 'frames' && <div className="grid h-full grid-cols-5 gap-[3px]">{(s.frames || []).slice(0, 10).map(fr => (
                // eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames
                <img key={fr} alt="" className="h-full w-full object-cover" src={evidenceUrl(gameId, run.id, fr)} />))}</div>}
              {!playable && <div className="flex h-full items-center justify-center p-8 text-center font-mono text-[12px] leading-6 text-paper/70">{s.error || L('这个物种在制作阶段夭折，没有可玩的版本。', 'This species was stillborn; there is no playable build.')}</div>}
            </div>
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-ink3"><span className="font-serif text-ink">{L('图版', 'Plate')}</span> · {s.name || s.id} · {view === 'play' ? L('沙箱实机，可直接操作', 'live sandbox, playable') : view === 'video' ? L('AI 玩家试玩录像', 'AI playtest recording') : L('试玩中采集的真实截图', 'real frames captured in play')}</span>
            <span className="inline-flex border border-ink/80 text-[12px]">
              {([['play', L('实机试玩', 'Play')], ['video', L('试玩录像', 'Recording')], ['frames', L('截图帧', 'Frames')]] as const).map(([k, label], i) =>
                <button key={k} onClick={() => setView(k)} disabled={(k === 'video' && !video) || (k === 'play' && !playable)}
                  className={`px-3 py-1.5 transition disabled:opacity-30 ${i ? 'border-l border-ink/80' : ''} ${view === k ? 'bg-ink text-paper' : 'hover:bg-ink/5'}`}>{label}</button>)}
            </span>
          </figcaption>
        </figure>

        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-ink pb-2"><h3 className="font-serif text-[17px] font-semibold">{L('测量', 'Measurements')}</h3><span className="font-mono text-[10px] text-ink3">F = .35 {L('盲评', 'rev')} + .30 {L('社会', 'soc')} + .15 {L('进度', 'prog')} + .20 {L('新颖', 'nov')}</span></div>
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex justify-center"><Radar values={[f?.review ?? 0, f?.social ?? 0, f?.progress ?? 0, f?.novelty ?? 0, s.metrics?.challenge ?? 0]} labels={[L('盲评', 'Review'), L('社会', 'Society'), L('进度', 'Progress'), L('新颖', 'Novelty'), L('挑战', 'Challenge')]} color={gene.color} /></div>
            <div className="grid grid-cols-3">
              {[[L('综合适应度', 'Fitness F'), fmt(f?.F)], [L('社会分', 'Society S'), fmt(s.society?.S)], [L('盲评得票', 'Blind votes'), f ? `${Math.round((f.review ?? 0) * 2 * 10) / 10}/2` : '—'],
                [L('最远进度', 'Progress'), pct(s.metrics?.progress)], [L('留存率', 'Retention'), pct(s.society?.metrics?.retention)], [L('真人选择', 'Human picks'), String(like)]].map(([k, v], i) =>
                <div key={k} className={`py-4 ${i % 3 ? 'border-l border-rule pl-4' : ''} ${i < 3 ? 'border-b border-rule' : ''}`}>
                  <div className={`font-display leading-none num ${i === 0 ? 'text-[46px] text-vermilion' : 'text-[38px]'}`}>{v}</div>
                  <div className="mt-1.5 text-[12px] text-ink3">{k}</div>
                </div>)}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between border-b border-ink pb-2"><h3 className="font-serif text-[17px] font-semibold">{L('血统', 'Lineage')}</h3><span className="font-mono text-[10px] text-ink3">{L(`${lineage.length} 代`, `${lineage.length} generations`)}</span></div>
          <ol className="flex flex-wrap items-center gap-y-2">
            {lineage.map((x, i) => <li key={x.id} className="flex items-center">
              {i > 0 && <span className="mx-2 text-ink3">→</span>}
              <button onClick={() => onOpen(x.id)} className={`flex items-center gap-2 border px-2.5 py-1.5 text-[13px] transition ${x.id === s.id ? 'border-ink bg-ink text-paper' : 'border-rule hover:border-ink'}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-paper" style={{background: geneOf(x.gene).color}}>{geneOf(x.gene).glyph}</span>
                <span className="font-serif">{x.name || x.id}</span>
              </button>
            </li>)}
          </ol>
          {kids.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink3">{L('后代', 'Offspring')}：{kids.map(k => <button key={k.id} onClick={() => onOpen(k.id)} className="flex items-center gap-1.5 border border-rule px-2 py-1 text-ink2 transition hover:border-ink"><span className="inline-block h-2 w-2 rounded-full" style={{background: geneOf(k.gene).color}} /><span className="font-serif">{k.name || k.id}</span><span className="font-mono text-[10px] text-ink3">{fmt(k.fitness?.F)}</span></button>)}</div>}
        </section>
      </div>

      <div className="space-y-10">
        <header>
          <h2 className="font-serif text-[56px] font-bold leading-[1.08] md:text-[68px]">{s.name || s.id}</h2>
          <div className="mt-2 font-display text-[26px] italic text-ink3">{s.latin}</div>
          {s.hypothesis && <p className="mt-6 border-l-2 border-ink pl-5 font-serif text-[17px] leading-[1.9] text-ink2">{s.hypothesis}</p>}
        </header>

        {!!(s.changes?.length || s.summary || s.error) && <section>
          <h3 className="mb-1 border-b border-ink pb-2 font-serif text-[17px] font-semibold">{parent ? L(`相比亲本「${parent.name || parent.id}」`, `Versus parent “${parent.name || parent.id}”`) : L('变异内容', 'Mutation')}</h3>
          <ol className="divide-y divide-rule">
            {(s.changes || []).map((c, i) => <li key={i} className="grid grid-cols-[28px_1fr] gap-2 py-2.5 text-[14px] leading-6"><span className="font-mono text-[11px] leading-6 text-ink3 num">{String(i + 1).padStart(2, '0')}</span><span>{c}</span></li>)}
          </ol>
          {s.summary && <p className="mt-3 text-[13px] leading-6 text-ink3">{s.summary}</p>}
          {s.error && <p className="mt-3 font-mono text-[12px] text-vermilion">{s.error}</p>}
        </section>}

        {!!s.reviews?.length && <section>
          <div className="mb-1 flex items-baseline justify-between border-b border-ink pb-2"><h3 className="font-serif text-[17px] font-semibold">{L('双顺序盲评', 'Reversed blind reviews')}</h3><span className="text-[11px] text-ink3">{L('评审看不到源码和新旧顺序', 'No source, no old/new order')}</span></div>
          <div className="grid sm:grid-cols-2">{s.reviews.map((r, i) => {
            const [label, cls] = verdict(r);
            return <div key={r.order} className={`py-4 ${i ? 'sm:border-l sm:border-rule sm:pl-5' : 'sm:pr-5'}`}>
              <div className="mb-2 flex items-baseline justify-between"><span className="font-mono text-[11px] text-ink3">{r.order}</span><span className={`text-[13px] font-semibold ${cls}`}>{label}</span></div>
              <p className="line-clamp-5 text-[13px] leading-6 text-ink2">{r.reason}</p>
            </div>;
          })}</div>
          <p className="border-t border-rule pt-3 text-[12px] leading-5 text-ink3">{s.promoted ? L('两次盲评都偏好后代，并引用了真实证据 → 有资格成为冠军。', 'Both reviews prefer the child with valid evidence → eligible as champion.') : L('没有同时赢下两次盲评 → 只作为档案保留，不能直接成为冠军。', 'Did not win both reviews → archived, not eligible as champion.')}</p>
        </section>}

        {!!s.society?.posts?.length && <section>
          <div className="mb-4 flex items-baseline justify-between border-b border-ink pb-2"><h3 className="font-serif text-[17px] font-semibold">{L('玩家社会', 'Player society')}</h3><button className="link text-[12px]" onClick={onObserve}>{L('进入观察台', 'Observatory')} →</button></div>
          <blockquote className="relative pl-7 font-serif text-[16px] leading-8"><span className="absolute -top-1 left-0 font-display text-[44px] leading-none text-vermilion">“</span>{s.society.summary}</blockquote>
          <ul className="mt-4 max-h-72 divide-y divide-rule overflow-auto border-y border-rule pr-1">{s.society.posts.slice(0, 8).map(p => <li key={p.persona} className="grid grid-cols-[34px_1fr] gap-3 py-3">
            <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border font-serif text-[13px] ${p.stay ? 'border-verdigris text-verdigris' : 'border-vermilion text-vermilion'}`}>{p.name.slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink3"><span className="font-medium text-ink">{p.name}</span><span>{p.archLabel}</span><span>·</span><span>{L(`第 ${p.day} 天`, `Day ${p.day}`)}</span><Stars n={p.rating} />{!p.stay && <span className="text-vermilion">{L('弃坑', 'quit')}</span>}</div>
              <div className="mt-0.5 text-[14px] leading-6">{p.text}</div>
            </div>
          </li>)}</ul>
        </section>}

        <section className="flex flex-wrap items-center gap-2 border-t border-ink pt-6">
          {version && <button disabled={!!busy} onClick={() => act('apply', () => onApply(version))} className="btn-ink px-5 py-3">{L('选用此版本', 'Apply this version')}</button>}
          <button disabled={s.status !== 'alive' || !!busy} onClick={() => act('like', async () => { await api(`/api/evolve/${gameId}/${run.id}/like`, {species: s.id}); onLike(); })} className="btn border border-vermilion px-5 py-3 text-vermilion hover:bg-vermilion hover:text-paper">♥ {L('自然选择它', 'Select it')} <span className="font-mono num">{like}</span></button>
          {version && <a className="btn-quiet px-5 py-3" href={`/api/export/${gameId}?version=${version}`}>{L('导出离线 ZIP', 'Offline ZIP')} ↓</a>}
          {!version && s.status === 'alive' && <span className="text-[12px] text-ink3">{L('进化结束后可以选用和导出', 'Apply/export after the run finishes')}</span>}
          {msg && <p className="w-full text-[13px] text-vermilion">{msg}</p>}
        </section>
      </div>
    </div>
  </div>;
}
