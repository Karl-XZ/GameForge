'use client';
import * as React from 'react';
import {useState} from 'react';
import {api, evidenceUrl, fmt, geneOf, pct, speciesUrl, SWATCH, type Run, type Species} from './common';

export function Radar({values, labels, color = '#E8132E', size = 240}: {values: number[]; labels: string[]; color?: string; size?: number}) {
  const c = size / 2, R = size * 0.34; const n = values.length;
  const pt = (i: number, r: number) => [c + Math.sin((i / n) * Math.PI * 2) * r, c - Math.cos((i / n) * Math.PI * 2) * r];
  const poly = values.map((v, i) => pt(i, R * Math.max(0.04, Math.min(1, v))).join(',')).join(' ');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
    {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} points={values.map((_, i) => pt(i, R * k).join(',')).join(' ')} fill={k === 1 ? '#F2EFE9' : 'none'} stroke="#0B0B0D" strokeOpacity={k === 1 ? 1 : 0.15} strokeWidth={k === 1 ? 2.5 : 1} />)}
    {values.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#0B0B0D" strokeOpacity={0.15} />; })}
    <polygon points={poly} transform="translate(4 4)" fill="#0B0B0D" />
    <polygon points={poly} fill={color} stroke="#0B0B0D" strokeWidth={2.5} strokeLinejoin="miter" />
    {values.map((v, i) => { const [x, y] = pt(i, R * Math.max(0.04, Math.min(1, v))); return <rect key={i} x={x - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x} ${y})`} fill="#FFFFFF" stroke="#0B0B0D" strokeWidth={2} />; })}
    {labels.map((l, i) => { const [x, y] = pt(i, R + 24); return <g key={l}><text x={x} y={y} textAnchor="middle" fontSize={13} fontWeight={900} fill="#0B0B0D" fontFamily="'Noto Sans SC', sans-serif">{l}</text><text x={x} y={y + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#E8132E" fontFamily="'JetBrains Mono', monospace">{fmt(values[i])}</text></g>; })}
  </svg>;
}

export function lineageOf(species: Species[], s: Species) {
  const out: Species[] = []; let cur: Species | undefined = s;
  while (cur) { out.unshift(cur); cur = species.find(x => x.id === cur!.parent); }
  return out;
}

export const Stars = ({n}: {n: number}) => <span className="tracking-[0.05em] text-pop">{'★'.repeat(n)}<span className="text-fog">{'★'.repeat(Math.max(0, 5 - n))}</span></span>;

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
    if (won) return [L('偏好后代', 'Prefers child'), 'bg-volt text-jet'];
    if (r.winner === 'tie') return [L('平局', 'Tie'), 'bg-snow text-jet'];
    if (r.winner === 'unavailable') return [L('证据不足', 'Unavailable'), 'bg-snow text-ink3'];
    return [L('偏好亲本', 'Prefers parent'), 'bg-pop text-snow'];
  };

  const H3 = ({children, aside}: {children: React.ReactNode; aside?: React.ReactNode}) => <div className="-mx-5 -mt-5 mb-5 flex flex-wrap items-center justify-between gap-2 bg-jet px-5 py-2.5 text-snow"><h3 className="heavy text-[16px]">{children}</h3>{aside}</div>;
  return <div className="fade-up">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="tag tag-white text-[13px]"><span>{L('标本', 'Specimen')} #{s.id}</span></span>
        <span className="tag text-[13px]"><span>{L(`第 ${s.gen} 代`, `Gen ${s.gen}`)}</span></span>
        <span className="tag text-[13px]"><span className={SWATCH} style={{background: gene.color, borderColor: '#fff'}} /><span>{zh ? gene.zh : gene.en}</span></span>
        {s.cell && <span className="tag text-[13px]"><span>{L('档案格', 'Cell')} {s.cell.join('-')}</span></span>}
        {s.elite && <span className="tag tag-white text-[13px]"><span>{L('档案库精英', 'Elite')}</span></span>}
        {champion && <span className="tag tag-volt rotate-[-3deg] text-[14px]"><span>★ {L('当前冠军', 'Champion')}</span></span>}
      </div>
      <button className="btn-line py-2 text-[14px]" onClick={onClose}>← {L('回到谱系', 'Back to lineage')}</button>
    </div>

    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <div className="space-y-10">
        <figure>
          <div className="relative border-[3px] border-jet bg-jet p-2 shadow-hard-lg">
            <div className="aspect-video w-full bg-[#111]">
              {view === 'play' && playable && <iframe key={s.id} title={s.name} className="h-full w-full" sandbox="allow-scripts allow-pointer-lock" src={speciesUrl(gameId, run.id, s.id)} />}
              {view === 'video' && video && <video key={video} className="h-full w-full object-contain" src={evidenceUrl(gameId, run.id, video)} controls autoPlay muted loop />}
              {view === 'frames' && <div className="grid h-full grid-cols-5 gap-1">{(s.frames || []).slice(0, 10).map(fr => (
                // eslint-disable-next-line @next/next/no-img-element -- integrity-checked evidence frames
                <img key={fr} alt="" className="h-full w-full object-cover" src={evidenceUrl(gameId, run.id, fr)} />))}</div>}
              {!playable && <div className="halftone-white flex h-full items-center justify-center p-8 text-center font-mono text-[12px] leading-6 text-snow/70">{s.error || L('这个物种在制作阶段夭折，没有可玩的版本。', 'This species was stillborn; there is no playable build.')}</div>}
            </div>
          </div>
          <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="bg-jet px-3 py-1.5 text-[12px] text-snow/80">{view === 'play' ? L('沙箱实机，可直接操作', 'Live sandbox, playable') : view === 'video' ? L('AI 玩家试玩录像', 'AI playtest recording') : L('试玩中采集的真实截图', 'Real frames captured in play')}</span>
            <span className="flex gap-2">
              {([['play', L('实机试玩', 'Play')], ['video', L('试玩录像', 'Recording')], ['frames', L('截图帧', 'Frames')]] as const).map(([k, label]) =>
                <button key={k} onClick={() => setView(k)} disabled={(k === 'video' && !video) || (k === 'play' && !playable)}
                  className={`-skew-x-[8deg] border-[2.5px] border-jet px-3.5 py-1.5 font-cond text-[14px] font-extrabold italic transition disabled:opacity-30 ${view === k ? 'bg-jet text-snow shadow-[3px_3px_0_#FFFFFF]' : 'bg-snow text-jet hover:bg-volt'}`}><span className="inline-block skew-x-[8deg]">{label}</span></button>)}
            </span>
          </figcaption>
        </figure>

        <section className="plate p-5">
          <H3 aside={<span className="font-mono text-[10px] text-snow/60">F = .35 {L('盲评', 'rev')} + .30 {L('社会', 'soc')} + .15 {L('进度', 'prog')} + .20 {L('新颖', 'nov')}</span>}>{L('测量', 'Measurements')}</H3>
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex justify-center"><Radar values={[f?.review ?? 0, f?.social ?? 0, f?.progress ?? 0, f?.novelty ?? 0, s.metrics?.challenge ?? 0]} labels={[L('盲评', 'Review'), L('社会', 'Society'), L('进度', 'Progress'), L('新颖', 'Novelty'), L('挑战', 'Challenge')]} color={gene.color} /></div>
            <div className="grid grid-cols-3 gap-2.5">
              {[[L('综合适应度', 'Fitness F'), fmt(f?.F)], [L('社会分', 'Society S'), fmt(s.society?.S)], [L('盲评得票', 'Blind votes'), f ? `${Math.round((f.review ?? 0) * 2 * 10) / 10}/2` : '—'],
                [L('最远进度', 'Progress'), pct(s.metrics?.progress)], [L('留存率', 'Retention'), pct(s.society?.metrics?.retention)], [L('真人选择', 'Human picks'), String(like)]].map(([k, v], i) =>
                <div key={k} className={`-skew-x-[6deg] border-[2.5px] border-jet px-3 py-2.5 ${i === 0 ? 'bg-pop text-snow shadow-hard-sm' : 'bg-snow'}`}>
                  <div className="skew-x-[6deg]">
                    <div className="font-display text-[32px] leading-none num">{v}</div>
                    <div className={`mt-1.5 text-[11px] font-semibold ${i === 0 ? 'text-snow/85' : 'text-ink3'}`}>{k}</div>
                  </div>
                </div>)}
            </div>
          </div>
        </section>

        <section className="plate p-5">
          <H3 aside={<span className="font-display text-[14px] text-snow/70">{L(`${lineage.length} 代`, `${lineage.length} gens`)}</span>}>{L('血统', 'Lineage')}</H3>
          <ol className="flex flex-wrap items-center gap-y-3">
            {lineage.map((x, i) => <li key={x.id} className="flex items-center">
              {i > 0 && <span className="mx-1.5 font-display text-[18px] text-pop">›</span>}
              <button onClick={() => onOpen(x.id)} className={`flex -skew-x-[8deg] items-center gap-2 border-[2.5px] border-jet px-2.5 py-1.5 text-[13px] font-bold transition ${x.id === s.id ? 'bg-jet text-snow shadow-hard-red' : 'bg-snow hover:bg-volt'}`}>
                <span className="flex h-5 w-5 skew-x-[8deg] items-center justify-center border-2 border-jet font-display text-[11px] text-jet" style={{background: geneOf(x.gene).color}}>{geneOf(x.gene).glyph}</span>
                <span className="skew-x-[8deg]">{x.name || x.id}</span>
              </button>
            </li>)}
          </ol>
          {kids.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-jet/20 pt-4 text-[12px] font-bold text-ink3">{L('后代', 'Offspring')}{kids.map(k => <button key={k.id} onClick={() => onOpen(k.id)} className="flex items-center gap-2 border-2 border-jet bg-snow px-2 py-1 text-jet transition hover:bg-volt"><span className={SWATCH} style={{background: geneOf(k.gene).color}} /><span>{k.name || k.id}</span><span className="font-mono text-[10px] text-pop">{fmt(k.fitness?.F)}</span></button>)}</div>}
        </section>
      </div>

      <div className="space-y-9">
        <header>
          <h2 className="shout -skew-x-[6deg] text-[50px] leading-[1.08] md:text-[68px]">{s.name || s.id}</h2>
          {s.latin && <div className="mt-4"><span className="tag rotate-[-2deg] px-3.5 py-1.5 text-[19px] normal-case"><span>{s.latin}</span></span></div>}
          {s.hypothesis && <div className="bubble mt-9 border-[3px] border-jet bg-snow px-5 py-4 shadow-hard"><p className="text-[16px] font-medium leading-[1.85] text-ink2">{s.hypothesis}</p></div>}
        </header>

        {!!(s.changes?.length || s.summary || s.error) && <section className="plate p-5">
          <H3>{parent ? L(`相比亲本「${parent.name || parent.id}」`, `Versus parent “${parent.name || parent.id}”`) : L('变异内容', 'Mutation')}</H3>
          <ol className="space-y-2.5">
            {(s.changes || []).map((c, i) => <li key={i} className="grid grid-cols-[34px_1fr] items-start gap-3 text-[14px] leading-6"><span className="mt-0.5 flex h-6 w-8 -skew-x-[10deg] items-center justify-center bg-pop font-display text-[13px] text-snow num">{String(i + 1).padStart(2, '0')}</span><span>{c}</span></li>)}
          </ol>
          {s.summary && <p className="mt-4 bg-bone p-3 text-[13px] leading-6 text-ink2">{s.summary}</p>}
          {s.error && <p className="mt-3 font-mono text-[12px] text-pop">{s.error}</p>}
        </section>}

        {!!s.reviews?.length && <section className="plate p-5">
          <H3 aside={<span className="text-[11px] text-snow/60">{L('评审看不到源码和新旧顺序', 'No source, no old/new order')}</span>}>{L('双顺序盲评', 'Reversed blind reviews')}</H3>
          <div className="grid gap-4 sm:grid-cols-2">{s.reviews.map(r => {
            const [label, cls] = verdict(r);
            return <div key={r.order} className="relative border-[2.5px] border-jet p-4 pt-5">
              <span className="absolute -top-3.5 left-3 bg-snow px-1 font-display text-[18px] leading-none">{r.order}</span>
              <span className={`absolute -right-2 -top-3.5 rotate-[4deg] border-[2.5px] border-jet px-2 py-0.5 heavy text-[13px] ${cls}`}>{label}</span>
              <p className="line-clamp-5 text-[13px] leading-6 text-ink2">{r.reason}</p>
            </div>;
          })}</div>
          <p className={`mt-4 border-l-[5px] px-3 py-2 text-[12px] font-semibold leading-5 ${s.promoted ? 'border-jet bg-volt text-jet' : 'border-pop bg-bone text-ink2'}`}>{s.promoted ? L('两次盲评都偏好后代，并引用了真实证据 → 有资格成为冠军。', 'Both reviews prefer the child with valid evidence → eligible as champion.') : L('没有同时赢下两次盲评 → 只作为档案保留，不能直接成为冠军。', 'Did not win both reviews → archived, not eligible as champion.')}</p>
        </section>}

        {!!s.society?.posts?.length && <section className="plate-dark halftone-white p-5">
          <div className="mb-4 flex items-center justify-between"><span className="tag tag-red text-[14px]"><span>{L('玩家社会', 'Player society')}</span></span><button className="btn-line py-1.5 text-[13px]" onClick={onObserve}>{L('进入观察台', 'Society view')} →</button></div>
          <blockquote className="heavy relative pl-9 text-[17px] leading-8"><span className="absolute -top-2 left-0 font-display text-[52px] leading-none text-pop">“</span>{s.society.summary}</blockquote>
          <ul className="mt-5 max-h-80 space-y-2.5 overflow-auto pr-1">{s.society.posts.slice(0, 8).map(p => <li key={p.persona} className="grid grid-cols-[38px_1fr] gap-3 border-2 border-snow/10 bg-snow/[0.04] p-2.5">
            <span className={`flex h-[34px] w-[34px] -skew-x-[8deg] items-center justify-center heavy text-[15px] ${p.stay ? 'bg-volt text-jet' : 'bg-pop text-snow'}`}>{p.name.slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-snow/55"><span className="font-bold text-snow">{p.name}</span><span>{p.archLabel}</span><span>·</span><span>{L(`第 ${p.day} 天`, `Day ${p.day}`)}</span><Stars n={p.rating} />{!p.stay && <span className="font-bold text-pop">{L('弃坑', 'quit')}</span>}</div>
              <div className="mt-0.5 text-[14px] leading-6 text-snow/90">{p.text}</div>
            </div>
          </li>)}</ul>
        </section>}

        <section className="flex flex-wrap items-center gap-4 pt-2">
          {version && <button disabled={!!busy} onClick={() => act('apply', () => onApply(version))} className="btn-ink px-6 py-3.5 text-[17px]">{L('选用此版本', 'Apply this version')}</button>}
          <button disabled={s.status !== 'alive' || !!busy} onClick={() => act('like', async () => { await api(`/api/evolve/${gameId}/${run.id}/like`, {species: s.id}); onLike(); })} className="btn-red px-6 py-3.5 text-[17px]">♥ {L('自然选择它', 'Select it')} <span className="font-display not-italic num">{like}</span></button>
          {version && <a className="btn-line px-6 py-3.5 text-[17px]" href={`/api/export/${gameId}?version=${version}`}>{L('导出离线 ZIP', 'Offline ZIP')} ↓</a>}
          {!version && s.status === 'alive' && <span className="bg-jet px-3 py-1.5 text-[12px] text-snow/80">{L('进化结束后可以选用和导出', 'Apply/export after the run finishes')}</span>}
          {msg && <p className="w-full bg-volt px-3 py-2 text-[13px] font-semibold text-jet">{msg}</p>}
        </section>
      </div>
    </div>
  </div>;
}
