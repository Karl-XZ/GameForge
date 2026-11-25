'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {api, fmt, geneOf, pct, type Persona, type Run, type Species} from './common';
import {Stars} from './Specimen';

const STATE_COLOR = ['#CBC2AE', '#1B1A17', '#2E6E5C', '#B8401F'];

function Network({people, timeline, day, posted, onPick, archetypes}: {people: Persona[]; timeline: number[][]; day: number; posted: Set<string>; onPick: (id: string) => void; archetypes: Record<string, string>}) {
  const ref = useRef<HTMLCanvasElement>(null); const [hover, setHover] = useState<string | null>(null);
  const pos = useMemo(() => {
    const archs = Object.keys(archetypes); const out: Record<string, {x: number; y: number}> = {};
    people.forEach(p => {
      const a = archs.indexOf(p.arch); const k = people.filter(q => q.arch === p.arch).indexOf(p);
      const base = (a / archs.length) * Math.PI * 2 - Math.PI / 2; const ang = base + (k - 1.5) * 0.12;
      const r = 0.34 + (k % 2) * 0.07 + ((p.id.charCodeAt(1) * 7) % 5) * 0.012;
      out[p.id] = {x: 0.5 + Math.cos(ang) * r, y: 0.5 + Math.sin(ang) * r * 0.92};
    });
    return out;
  }, [people, archetypes]);
  const st = useRef({day, hover}); st.current = {day, hover};
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!; let raf = 0; const dpr = Math.min(2, devicePixelRatio || 1); const t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000; const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const states = timeline[Math.max(0, Math.min(timeline.length - 1, st.current.day - 1))] || [];
      const P = (id: string) => ({x: pos[id].x * w, y: pos[id].y * h});
      people.forEach((p, i) => {
        for (const f of p.follows) {
          if (!pos[f]) continue; const a = P(f), b = P(p.id); const j = people.findIndex(q => q.id === f);
          const active = (states[j] ?? 0) >= 2 && (states[i] ?? 0) >= 1;
          ctx.strokeStyle = active ? 'rgba(46,110,92,0.16)' : 'rgba(27,26,23,0.05)'; ctx.lineWidth = active ? 0.9 : 0.6;
          const mx = (a.x + b.x) / 2 + (w / 2 - (a.x + b.x) / 2) * 0.35, my = (a.y + b.y) / 2 + (h / 2 - (a.y + b.y) / 2) * 0.35;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          if (active && (i + j) % 3 === 0) { const k = (t * 0.6 + i * 0.13) % 1; const x = (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * mx + k * k * b.x, y = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * my + k * k * b.y; ctx.fillStyle = '#2E6E5C'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
        }
      });
      people.forEach((p, i) => {
        const {x, y} = P(p.id); const s = states[i] ?? 0; const big = p.arch === 'kol' || posted.has(p.id);
        const r = big ? 7 : 5; const col = STATE_COLOR[s];
        ctx.fillStyle = '#F2EEE4'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fill();
        if (s === 1) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
        if (posted.has(p.id)) { ctx.strokeStyle = '#A86F1A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); }
        if (st.current.hover === p.id || big) { ctx.fillStyle = st.current.hover === p.id ? '#1B1A17' : '#45423B'; ctx.font = (st.current.hover === p.id ? '600 ' : '') + '12px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.fillText(p.name, x, y - r - 7); }
      });
      const archs = Object.keys(archetypes);
      archs.forEach((a, k) => { const ang = (k / archs.length) * Math.PI * 2 - Math.PI / 2; ctx.fillStyle = '#7A7466'; ctx.font = '11px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.fillText(archetypes[a], w / 2 + Math.cos(ang) * w * 0.47, h / 2 + Math.sin(ang) * h * 0.46); });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [people, timeline, pos, posted, archetypes]);
  const pick = (e: React.MouseEvent) => { const r = ref.current!.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; let best: string | null = null, bd = 0.03; for (const p of people) { const d = Math.hypot(pos[p.id].x - x, pos[p.id].y - y); if (d < bd) { bd = d; best = p.id; } } return best; };
  return <canvas ref={ref} className="h-full w-full cursor-pointer" onMouseMove={e => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={e => { const id = pick(e); if (id) onPick(id); }} />;
}

export function Observatory({run, gameId, locale, people, archetypes, sid, onSelect, onOpen}: {
  run: Run; gameId: string; locale: string; people: Persona[]; archetypes: Record<string, string>; sid: string | null; onSelect: (sid: string) => void; onOpen: (sid: string) => void;
}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const alive = (run.evolution?.species || []).filter(s => s.status === 'alive' && s.society).sort((a, b) => (b.fitness?.F ?? 0) - (a.fitness?.F ?? 0));
  const s: Species | undefined = alive.find(x => x.id === sid) || alive[0];
  const [day, setDay] = useState(7); const [playing, setPlaying] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);
  const [chat, setChat] = useState<{q: string; a: string}[]>([]); const [q, setQ] = useState(''); const [asking, setAsking] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { setChat([]); setErr(''); }, [persona, s?.id]);
  useEffect(() => { if (!playing) return; setDay(1); let d = 1; const t = setInterval(() => { d++; if (d > 7) { clearInterval(t); setPlaying(false); } else setDay(d); }, 900); return () => clearInterval(t); }, [playing]);
  if (!s?.society) return <div className="py-24 text-center text-[14px] text-ink3">{L('还没有完成社会推演的物种。', 'No species has finished the society simulation yet.')}</div>;
  const soc = s.society; const posted = new Set(soc.posts.map(p => p.persona));
  const person = people.find(p => p.id === persona);
  const post = person ? soc.posts.find(p => p.persona === person.id) || soc.posts.find(p => p.arch === person.arch) : undefined;
  const ask = async (question: string) => {
    if (!person || !question.trim()) return; setAsking(true); setErr('');
    try { const r = await api(`/api/evolve/${gameId}/${run.id}/interview`, {species: s.id, persona: person.id, question, history: chat}); setChat(c => [...c, {q: question, a: r.answer}]); setQ(''); }
    catch (e) { setErr(String(e)); } finally { setAsking(false); }
  };
  const m = soc.metrics;
  return <div className="fade-up relative grid min-h-[700px] gap-8 lg:grid-cols-[240px_minmax(0,1fr)_330px]">
    <aside>
      <div className="eyebrow mb-2 border-b border-ink pb-2">{L('物种', 'Species')} · {alive.length}</div>
      <div className="max-h-[700px] divide-y divide-rule overflow-auto">
        {alive.map(x => <button key={x.id} onClick={() => onSelect(x.id)} className={`relative block w-full py-3 pl-4 pr-2 text-left transition ${x.id === s.id ? 'bg-card' : 'hover:bg-card/60'}`}>
          {x.id === s.id && <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-vermilion" />}
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{background: geneOf(x.gene).color}} /><span className="truncate font-serif text-[16px] font-semibold">{x.name}</span></div>
          <div className="mt-0.5 font-mono text-[10.5px] text-ink3 num">{x.id} · F {fmt(x.fitness?.F)} · S {fmt(x.society?.S)}</div>
        </button>)}
      </div>
    </aside>
    <section className="relative min-h-[620px] border border-ink bg-card">
      <div className="dotgrid absolute inset-0 opacity-60" />
      <div className="absolute left-5 top-4 z-10 max-w-[60%]">
        <div className="eyebrow">{L('图 · 口碑在 40 人关注网络中的扩散', 'Fig. · word of mouth over a 40-person follow graph')}</div>
        <div className="mt-2 flex items-baseline gap-3"><h3 className="font-serif text-[28px] font-bold">{s.name}</h3><span className="font-display text-[22px] italic text-vermilion">{L(`第 ${day} 天`, `Day ${day}`)}</span></div>
      </div>
      <button className="btn-quiet absolute right-4 top-4 z-10 bg-card py-1.5 text-[12px]" onClick={() => onOpen(s.id)}>{L('查看标本', 'Open specimen')} →</button>
      <div className="absolute inset-0 pb-14 pt-16"><Network people={people} timeline={soc.timeline} day={day} posted={posted} onPick={setPersona} archetypes={archetypes} /></div>
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink bg-card px-5 py-3">
        <button className="btn-quiet py-1 text-[12px]" onClick={() => setPlaying(true)}>▶ {L('回放一周', 'Replay week')}</button>
        <input aria-label="day" type="range" min={1} max={7} value={day} onChange={e => setDay(Number(e.target.value))} className="scrub min-w-[120px] flex-1" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink2">{[[0, L('未接触', 'Unaware')], [1, L('看到了', 'Exposed')], [2, L('玩了并留下', 'Stayed')], [3, L('弃坑', 'Quit')]].map(([k, l]) => <span key={k as number} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{background: k === 1 ? 'transparent' : STATE_COLOR[k as number], border: k === 1 ? '1.5px solid #1B1A17' : 'none'}} />{l}</span>)}
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-ochre" />{L('发过帖，可采访', 'Posted · interview')}</span></div>
      </div>
    </section>
    <aside className="space-y-6">
      <div className="grid grid-cols-2 border-t border-ink">
        {[[L('触达', 'Reach'), pct(m.reach)], [L('尝试率', 'Try rate'), pct(m.tryRate)], [L('留存', 'Retention'), pct(m.retention)], [L('口碑', 'Sentiment'), (m.sentiment > 0 ? '+' : '') + fmt(m.sentiment)]].map(([k, v], i) =>
          <div key={k} className={`border-b border-rule py-4 ${i % 2 ? 'border-l pl-4' : ''}`}><div className="font-display text-[40px] leading-none num">{v}</div><div className="mt-1.5 text-[12px] text-ink3">{k}</div></div>)}
      </div>
      <blockquote className="relative pl-6 font-serif text-[15px] leading-7"><span className="absolute -top-1 left-0 font-display text-[36px] leading-none text-vermilion">“</span>{soc.summary}</blockquote>
      <div>
        <div className="eyebrow mb-1 border-b border-ink pb-2">{L('帖子 · 截至当天', 'Feed · up to today')}</div>
        <div className="max-h-[400px] divide-y divide-rule overflow-auto">{soc.posts.filter(p => p.day <= day).map(p => <button key={p.persona} onClick={() => setPersona(p.persona)} className="group block w-full py-3 text-left">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink3"><span className="font-medium text-ink group-hover:text-vermilion">{p.name}</span><span>{p.archLabel}</span><span>· {L(`第 ${p.day} 天`, `day ${p.day}`)}</span><Stars n={p.rating} />{!p.stay && <span className="text-vermilion">{L('弃坑', 'quit')}</span>}</div>
          <div className="mt-1 text-[14px] leading-6">{p.text}</div>
          {p.quit_reason && <div className="mt-1 text-[12px] text-vermilion">{L('弃坑原因：', 'Quit: ')}{p.quit_reason}</div>}
        </button>)}</div>
      </div>
    </aside>
    {person && <div className="fade-up absolute bottom-0 right-0 top-0 z-20 flex w-full max-w-[440px] flex-col border border-ink bg-card p-7 shadow-lift">
      <button className="absolute right-5 top-4 text-[22px] leading-none text-ink3 hover:text-ink" aria-label="close" onClick={() => setPersona(null)}>×</button>
      <div className="eyebrow">{L('采访记录', 'Interview transcript')}</div>
      <h3 className="mt-3 font-serif text-[36px] font-bold leading-none">{person.name}</h3>
      <div className="mt-2 text-[12px] text-ink3">{person.archLabel} · <span className="text-vermilion">{L('模拟玩家 · LLM 扮演', 'Simulated player · LLM')}</span></div>
      <p className="mt-4 text-[13px] leading-6 text-ink2">{person.bio} · {person.style}</p>
      {post && <div className="mt-4 border-y border-rule py-3 text-[13px] leading-6"><Stars n={post.rating} /> <span className="font-serif">{post.text}</span></div>}
      <div className="mt-5 flex-1 space-y-5 overflow-auto pr-1">
        {chat.length === 0 && <div className="border border-dashed border-rule p-4 text-center text-[13px] text-ink3">{L('可以问 TA 任何关于这款游戏的问题', 'Ask anything about this game')}</div>}
        {chat.map((c, i) => <div key={i} className="space-y-2">
          <div className="grid grid-cols-[22px_1fr] gap-2 text-[14px] leading-6"><span className="font-serif font-bold text-ink3">{L('问', 'Q')}</span><span className="font-medium">{c.q}</span></div>
          <div className="grid grid-cols-[22px_1fr] gap-2 font-serif text-[15px] leading-7"><span className="font-bold text-vermilion">{L('答', 'A')}</span><span>{c.a}</span></div>
        </div>)}
        {asking && <div className="grid grid-cols-[22px_1fr] gap-2 font-serif text-[15px]"><span className="font-bold text-vermilion">{L('答', 'A')}</span><span className="breathe text-ink3">……</span></div>}
        {err && <div className="text-[13px] text-vermilion">{err}</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{[L('你为什么给这个分？', 'Why that rating?'), L('如果让你改一个地方，你会改什么？', 'What one thing would you change?')].map(x => <button key={x} disabled={asking} onClick={() => ask(x)} className="border border-rule px-2.5 py-1 text-[12px] text-ink2 transition hover:border-ink disabled:opacity-40">{x}</button>)}</div>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={L('比如：你为什么弃坑？', 'e.g. why did you quit?')} className="field flex-1" />
        <button disabled={asking || !q.trim()} className="btn-ink px-5">{L('提问', 'Ask')}</button>
      </form>
    </div>}
  </div>;
}
