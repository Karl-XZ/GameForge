'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {api, fmt, geneOf, pct, SWATCH, type Persona, type Run, type Species} from './common';
import {Stars} from './Specimen';

const STATE_COLOR = ['#3A3A40', '#FFFFFF', '#FFE135', '#E8132E'];

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
      const t = Math.max(0, now - t0) / 1000; const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const states = timeline[Math.max(0, Math.min(timeline.length - 1, st.current.day - 1))] || [];
      const P = (id: string) => ({x: pos[id].x * w, y: pos[id].y * h});
      people.forEach((p, i) => {
        for (const f of p.follows) {
          if (!pos[f]) continue; const a = P(f), b = P(p.id); const j = people.findIndex(q => q.id === f);
          const active = (states[j] ?? 0) >= 2 && (states[i] ?? 0) >= 1;
          ctx.strokeStyle = active ? 'rgba(255,225,53,0.11)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = active ? 1 : 0.7;
          const mx = (a.x + b.x) / 2 + (w / 2 - (a.x + b.x) / 2) * 0.35, my = (a.y + b.y) / 2 + (h / 2 - (a.y + b.y) / 2) * 0.35;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          if (active && (i + j) % 5 === 0) { const k = (t * 0.6 + i * 0.13) % 1; const x = (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * mx + k * k * b.x, y = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * my + k * k * b.y; ctx.fillStyle = '#FFE135'; ctx.fillRect(x - 2, y - 2, 4, 4); }
        }
      });
      people.forEach((p, i) => {
        const {x, y} = P(p.id); const s = states[i] ?? 0; const big = p.arch === 'kol' || posted.has(p.id);
        const r = big ? 8 : 5.5; const col = STATE_COLOR[s]; const hov = st.current.hover === p.id;
        if (posted.has(p.id)) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4 + (hov ? t : 0)); ctx.strokeStyle = '#E8132E'; ctx.lineWidth = 2.5; ctx.strokeRect(-r - 5, -r - 5, (r + 5) * 2, (r + 5) * 2); ctx.restore(); }
        ctx.fillStyle = '#0B0B0D'; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, 7); ctx.fill();
        if (s === 1) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, 7); ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
        if (hov || big) {
          ctx.font = '900 12px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; const tw = ctx.measureText(p.name).width;
          ctx.fillStyle = hov ? '#FFE135' : '#FFFFFF'; ctx.fillRect(x - tw / 2 - 5, y - r - 23, tw + 10, 17);
          ctx.fillStyle = '#0B0B0D'; ctx.fillText(p.name, x, y - r - 10);
        }
      });
      const archs = Object.keys(archetypes);
      archs.forEach((a, k) => { const ang = (k / archs.length) * Math.PI * 2 - Math.PI / 2; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 12px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(archetypes[a], w / 2 + Math.cos(ang) * w * 0.47, h / 2 + Math.sin(ang) * h * 0.46); });
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
  if (!s?.society) return <div className="plate mx-auto max-w-xl py-14 text-center text-[15px] text-ink2">{L('还没有完成社会推演的物种。', 'No species has finished the society simulation yet.')}</div>;
  const soc = s.society; const posted = new Set(soc.posts.map(p => p.persona));
  const person = people.find(p => p.id === persona);
  const post = person ? soc.posts.find(p => p.persona === person.id) || soc.posts.find(p => p.arch === person.arch) : undefined;
  const ask = async (question: string) => {
    if (!person || !question.trim()) return; setAsking(true); setErr('');
    try { const r = await api(`/api/evolve/${gameId}/${run.id}/interview`, {species: s.id, persona: person.id, question, history: chat}); setChat(c => [...c, {q: question, a: r.answer}]); setQ(''); }
    catch (e) { setErr(String(e)); } finally { setAsking(false); }
  };
  const m = soc.metrics;
  return <div className="fade-up relative grid min-h-[700px] gap-7 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
    <aside className="plate self-start overflow-hidden">
      <div className="flex items-center justify-between bg-jet px-4 py-2.5 text-snow"><span className="heavy text-[15px]">{L('物种', 'Species')}</span><span className="font-display text-[16px] text-pop num">{alive.length}</span></div>
      <div className="max-h-[700px] overflow-auto">
        {alive.map(x => { const on = x.id === s.id; return <button key={x.id} onClick={() => onSelect(x.id)} className={`group relative block w-full border-b-2 border-jet/10 py-3 pl-5 pr-3 text-left transition ${on ? 'bg-jet text-snow' : 'hover:bg-volt'}`}>
          <span className={`absolute bottom-0 left-0 top-0 w-[6px] ${on ? 'bg-pop' : 'bg-transparent'}`} />
          <div className="flex items-center gap-2"><span className={SWATCH} style={{background: geneOf(x.gene).color, borderColor: on ? '#fff' : undefined}} /><span className="heavy truncate text-[15px]">{x.name}</span></div>
          <div className={`mt-0.5 font-mono text-[10.5px] num ${on ? 'text-snow/55' : 'text-ink3'}`}>{x.id} · F {fmt(x.fitness?.F)} · S {fmt(x.society?.S)}</div>
        </button>; })}
      </div>
    </aside>
    <section className="relative min-h-[640px] overflow-hidden border-[3px] border-jet bg-jet text-snow shadow-hard-lg">
      <div className="halftone-red absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
      <div className="pointer-events-none absolute -right-16 top-0 h-full w-1/3 -skew-x-[14deg] bg-snow/[0.03]" />
      <div className="absolute left-5 top-4 z-10 max-w-[62%]">
        <div className="tag tag-red"><span>{L('口碑在 40 人关注网络中的扩散', 'Word of mouth over a 40-person follow graph')}</span></div>
        <div className="mt-3 flex flex-wrap items-end gap-3"><h3 className="heavy slant text-[30px] leading-none">{s.name}</h3><span className="tag tag-volt text-[16px]"><span>{L(`第 ${day} 天`, `Day ${day}`)}</span></span></div>
      </div>
      <button className="btn-line absolute right-4 top-4 z-10 py-1.5 text-[13px]" onClick={() => onOpen(s.id)}>{L('查看标本', 'Open specimen')} →</button>
      <div className="absolute inset-0 pb-16 pt-20"><Network people={people} timeline={soc.timeline} day={day} posted={posted} onPick={setPersona} archetypes={archetypes} /></div>
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t-[3px] border-snow/15 bg-jet/85 px-5 py-3">
        <button className="btn-red py-1.5 text-[13px]" onClick={() => setPlaying(true)}>▶ {L('回放一周', 'Replay week')}</button>
        <input aria-label="day" type="range" min={1} max={7} value={day} onChange={e => setDay(Number(e.target.value))} className="scrub min-w-[120px] flex-1 text-snow" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-snow/80">{[[0, L('未接触', 'Unaware')], [1, L('看到了', 'Exposed')], [2, L('玩了并留下', 'Stayed')], [3, L('弃坑', 'Quit')]].map(([k, l]) => <span key={k as number} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{background: k === 1 ? 'transparent' : STATE_COLOR[k as number], border: k === 1 ? '2.5px solid #FFFFFF' : k === 0 ? '1px solid #666' : 'none'}} />{l}</span>)}
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 border-[2.5px] border-pop" />{L('发过帖，可采访', 'Posted · interview')}</span></div>
      </div>
    </section>
    <aside className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {[[L('触达', 'Reach'), pct(m.reach)], [L('尝试率', 'Try rate'), pct(m.tryRate)], [L('留存', 'Retention'), pct(m.retention)], [L('口碑', 'Sentiment'), (m.sentiment > 0 ? '+' : '') + fmt(m.sentiment)]].map(([k, v], i) =>
          <div key={k} className={`-skew-x-[6deg] border-[3px] border-jet px-4 py-3 ${i === 0 || i === 3 ? 'bg-snow shadow-hard' : 'bg-jet text-snow shadow-hard-white'}`}><div className="skew-x-[6deg]"><div className={`font-display text-[36px] leading-none num ${i === 0 || i === 3 ? 'text-pop' : ''}`}>{v}</div><div className={`heavy mt-1.5 text-[12px] ${i === 0 || i === 3 ? 'text-ink2' : 'text-snow/70'}`}>{k}</div></div></div>)}
      </div>
      <blockquote className="bubble heavy relative border-[3px] border-jet bg-snow py-4 pl-11 pr-4 text-[15px] leading-7 shadow-hard"><span className="absolute left-3 top-1 font-display text-[42px] leading-none text-pop">“</span>{soc.summary}</blockquote>
      <div className="plate overflow-hidden">
        <div className="bg-jet px-4 py-2.5 text-snow"><span className="heavy text-[15px]">{L('帖子 · 截至当天', 'Feed · up to today')}</span></div>
        <div className="max-h-[400px] overflow-auto">{soc.posts.filter(p => p.day <= day).map(p => <button key={p.persona} onClick={() => setPersona(p.persona)} className="group block w-full border-b-2 border-jet/10 px-4 py-3 text-left transition hover:bg-volt">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink3"><span className="font-bold text-jet group-hover:underline">{p.name}</span><span>{p.archLabel}</span><span>· {L(`第 ${p.day} 天`, `day ${p.day}`)}</span><Stars n={p.rating} />{!p.stay && <span className="font-bold text-pop">{L('弃坑', 'quit')}</span>}</div>
          <div className="mt-1 text-[14px] leading-6">{p.text}</div>
          {p.quit_reason && <div className="mt-1 text-[12px] font-semibold text-pop">{L('弃坑原因：', 'Quit: ')}{p.quit_reason}</div>}
        </button>)}</div>
      </div>
    </aside>
    {person && <div className="fade-up absolute bottom-0 right-0 top-0 z-20 flex w-full max-w-[460px] flex-col border-[3px] border-jet bg-snow shadow-hard-lg">
      <div className="relative bg-jet px-6 pb-5 pt-5 text-snow">
        <button className="absolute right-4 top-3 font-display text-[26px] leading-none text-snow/60 hover:text-pop" aria-label="close" onClick={() => setPersona(null)}>×</button>
        <span className="tag tag-red"><span>{L('采访', 'Interview')}</span></span>
        <h3 className="heavy slant mt-3 text-[38px] leading-none">{person.name}</h3>
        <div className="mt-2 text-[12px] text-snow/60">{person.archLabel} · <span className="font-bold text-volt">{L('模拟玩家 · LLM 扮演', 'Simulated player · LLM')}</span></div>
        <p className="mt-3 text-[13px] leading-6 text-snow/75">{person.bio} · {person.style}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-5">
        {post && <div className="border-[2.5px] border-jet bg-bone px-3 py-2.5 text-[13px] leading-6"><Stars n={post.rating} /> <span className="font-semibold">{post.text}</span></div>}
        <div className="mt-4 flex-1 space-y-4 overflow-auto pr-1">
          {chat.length === 0 && <div className="border-[2.5px] border-dashed border-jet/30 p-4 text-center text-[13px] text-ink3">{L('可以问 TA 任何关于这款游戏的问题', 'Ask anything about this game')}</div>}
          {chat.map((c, i) => <div key={i} className="space-y-3">
            <div className="flex justify-end"><div className="max-w-[85%] -skew-x-[4deg] bg-jet px-3.5 py-2 text-[14px] font-medium leading-6 text-snow shadow-[3px_3px_0_#E8132E]"><div className="skew-x-[4deg]">{c.q}</div></div></div>
            <div className="flex"><div className="max-w-[90%] border-[2.5px] border-jet bg-snow px-3.5 py-2.5 text-[15px] leading-7 shadow-hard-sm"><span className="tag tag-red mr-2 align-middle text-[11px]"><span>{person.name}</span></span>{c.a}</div></div>
          </div>)}
          {asking && <div className="flex"><div className="border-[2.5px] border-jet bg-snow px-4 py-2 shadow-hard-sm"><span className="breathe font-display text-[18px] tracking-[0.3em]">...</span></div></div>}
          {err && <div className="text-[13px] font-semibold text-pop">{err}</div>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{[L('你为什么给这个分？', 'Why that rating?'), L('如果让你改一个地方，你会改什么？', 'What one thing would you change?')].map(x => <button key={x} disabled={asking} onClick={() => ask(x)} className="border-2 border-jet bg-snow px-2.5 py-1 text-[12px] font-semibold transition hover:bg-volt disabled:opacity-40">{x}</button>)}</div>
        <form className="mt-3 flex gap-3" onSubmit={e => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={L('比如：你为什么弃坑？', 'e.g. why did you quit?')} className="field flex-1" />
          <button disabled={asking || !q.trim()} className="btn-ink px-5">{L('提问', 'Ask')}</button>
        </form>
      </div>
    </div>}
  </div>;
}
