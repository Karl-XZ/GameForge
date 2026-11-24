'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {api, fmt, geneOf, pct, type Persona, type Run, type Species} from './common';

const STATE_COLOR = ['rgba(148,163,184,0.28)', '#e8edf3', '#5eead4', '#ff6b9a'];

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
          ctx.strokeStyle = active ? 'rgba(94,234,212,0.2)' : 'rgba(148,163,184,0.05)'; ctx.lineWidth = active ? 1 : 0.7;
          const mx = (a.x + b.x) / 2 + (w / 2 - (a.x + b.x) / 2) * 0.35, my = (a.y + b.y) / 2 + (h / 2 - (a.y + b.y) / 2) * 0.35;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          if (active) { const k = (t * 0.6 + i * 0.13) % 1; const x = (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * mx + k * k * b.x, y = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * my + k * k * b.y; ctx.fillStyle = 'rgba(94,234,212,0.9)'; ctx.fillRect(x - 1, y - 1, 2, 2); }
        }
      });
      people.forEach((p, i) => {
        const {x, y} = P(p.id); const s = states[i] ?? 0; const big = p.arch === 'kol' || posted.has(p.id);
        const r = big ? 7 : 5; const col = STATE_COLOR[s];
        if (s >= 2) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5); g.addColorStop(0, col + '88'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, 7); ctx.fill(); }
        if (s === 1) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
        if (posted.has(p.id)) { ctx.strokeStyle = 'rgba(242,182,109,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 4 + Math.sin(t * 3 + i) * 1.2, 0, 7); ctx.stroke(); }
        if (st.current.hover === p.id || big) { ctx.fillStyle = st.current.hover === p.id ? '#fff' : 'rgba(232,237,243,0.6)'; ctx.font = '12px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.fillText(p.name, x, y - r - 7); }
      });
      const archs = Object.keys(archetypes);
      archs.forEach((a, k) => { const ang = (k / archs.length) * Math.PI * 2 - Math.PI / 2; ctx.fillStyle = 'rgba(133,147,166,0.75)'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(archetypes[a], w / 2 + Math.cos(ang) * w * 0.47, h / 2 + Math.sin(ang) * h * 0.46); });
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
  if (!s?.society) return <div className="p-10 text-center text-muted">{L('还没有完成社会推演的物种。', 'No species has finished the society simulation yet.')}</div>;
  const soc = s.society; const posted = new Set(soc.posts.map(p => p.persona));
  const person = people.find(p => p.id === persona);
  const post = person ? soc.posts.find(p => p.persona === person.id) || soc.posts.find(p => p.arch === person.arch) : undefined;
  const ask = async (question: string) => {
    if (!person || !question.trim()) return; setAsking(true); setErr('');
    try { const r = await api(`/api/evolve/${gameId}/${run.id}/interview`, {species: s.id, persona: person.id, question, history: chat}); setChat(c => [...c, {q: question, a: r.answer}]); setQ(''); }
    catch (e) { setErr(String(e)); } finally { setAsking(false); }
  };
  const m = soc.metrics;
  return <div className="fade-up relative grid min-h-[680px] gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
    <div className="max-h-[720px] space-y-1 overflow-auto pr-2">
      {alive.map(x => <button key={x.id} onClick={() => onSelect(x.id)} className={`block w-full border-l-2 px-4 py-3 text-left transition ${x.id === s.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-white/5'}`}>
        <div className="font-serif text-lg text-white">{x.name}</div>
        <div className="font-mono text-[11px] text-muted"><span style={{color: geneOf(x.gene).color}}>●</span> {x.id} · {L(`第 ${x.gen} 代`, `gen ${x.gen}`)} · F {fmt(x.fitness?.F)} · S {fmt(x.society?.S)}</div>
      </button>)}
    </div>
    <div className="relative min-h-[600px] rounded-2xl border border-border bg-[#060a10]/60">
      <div className="absolute left-5 top-4 z-10">
        <div className="flex items-baseline gap-3"><h3 className="font-serif text-3xl text-white">{s.name}</h3><span className="label-mono text-primary">{L(`第 ${day} 天`, `DAY ${day}`)}</span></div>
        <div className="mt-2 space-y-1 text-xs text-muted">{[[0, L('还不知道这个游戏', 'unaware')], [1, L('在信息流里看到了', 'exposed')], [2, L('玩了并留下', 'tried & stayed')], [3, L('弃坑', 'quit')]].map(([k, l]) => <div key={k as number} className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{background: k === 1 ? 'transparent' : STATE_COLOR[k as number], border: k === 1 ? '1px solid #e8edf3' : 'none'}} />{l}</div>)}
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full border border-amber" />{L('发帖的人设（可采访）', 'posted persona (interview)')}</div></div>
      </div>
      <button className="label-mono absolute right-4 top-4 z-10 rounded-md border border-border px-3 py-2 hover:border-primary/60" onClick={() => onOpen(s.id)}>{L('查看标本', 'Open specimen')}</button>
      <div className="absolute inset-0 pt-6"><Network people={people} timeline={soc.timeline} day={day} posted={posted} onPick={setPersona} archetypes={archetypes} /></div>
      <div className="absolute bottom-4 left-5 right-5 flex items-center gap-4">
        <button className="label-mono rounded-md border border-border px-3 py-2 text-text hover:border-primary/60" onClick={() => setPlaying(true)}>▶ {L('回放一周', 'Replay week')}</button>
        <input aria-label="day" type="range" min={1} max={7} value={day} onChange={e => setDay(Number(e.target.value))} className="flex-1 accent-[#5eead4]" />
      </div>
    </div>
    <div className="space-y-5">
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border">
        {[[L('触达', 'Reach'), pct(m.reach)], [L('尝试率', 'Try rate'), pct(m.tryRate)], [L('留存', 'Retention'), pct(m.retention)], [L('口碑', 'Sentiment'), (m.sentiment > 0 ? '+' : '') + fmt(m.sentiment)]].map(([k, v]) =>
          <div key={k} className="border-b border-r border-border p-4 [&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0"><div className="label-mono text-[10px]">{k}</div><div className="mt-1 font-serif text-3xl text-white">{v}</div></div>)}
      </div>
      <p className="font-serif leading-7 text-text/85">“{soc.summary}”</p>
      <div className="label-mono">{L('帖子流 · 截至当天', 'Feed · up to today')}</div>
      <div className="max-h-[400px] space-y-2 overflow-auto pr-2">{soc.posts.filter(p => p.day <= day).map(p => <button key={p.persona} onClick={() => setPersona(p.persona)} className="block w-full rounded-xl border border-border p-3 text-left text-sm hover:border-primary/40">
        <div className="text-xs text-muted">{p.name} · {p.archLabel} · {L(`第 ${p.day} 天`, `day ${p.day}`)} · <span className="text-amber">{'★'.repeat(p.rating)}</span>{!p.stay && <span className="text-rose"> · {L('弃坑', 'quit')}</span>}</div>
        <div className="mt-1 text-text/90">{p.text}</div>
        {p.quit_reason && <div className="mt-1 text-xs text-rose/80">{L('弃坑原因：', 'Quit: ')}{p.quit_reason}</div>}
      </button>)}</div>
    </div>
    {person && <div className="fade-up absolute bottom-0 right-0 top-0 z-20 flex w-full max-w-md flex-col rounded-2xl glass p-6 shadow-2xl">
      <button className="label-mono absolute right-5 top-5 hover:text-text" onClick={() => setPersona(null)}>×</button>
      <h3 className="font-serif text-4xl text-white">{person.name}</h3>
      <div className="label-mono mt-1 text-primary">{person.archLabel} · {L('模拟玩家 · LLM 扮演', 'SIMULATED PLAYER · LLM')}</div>
      <p className="mt-3 text-sm text-text/80">{person.bio} · {person.style}</p>
      {post && <div className="mt-3 rounded-lg border border-border p-3 text-sm text-text/80"><span className="text-amber">{'★'.repeat(post.rating)}</span> {post.text}</div>}
      <div className="mt-4 flex-1 space-y-3 overflow-auto">
        {chat.length === 0 && <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted">{L('（你可以问 TA 任何关于这款游戏的问题）', '(Ask anything about this game)')}</div>}
        {chat.map((c, i) => <div key={i} className="space-y-2"><div className="ml-10 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-white">{c.q}</div><div className="mr-10 rounded-lg border border-border bg-white/5 p-3 text-sm text-text/90">{c.a}</div></div>)}
        {asking && <div className="mr-10 rounded-lg border border-border p-3 text-sm text-muted">…</div>}
        {err && <div className="text-sm text-rose">{err}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{[L('你为什么给这个分？', 'Why that rating?'), L('如果让你改一个地方，你会改什么？', 'What one thing would you change?')].map(x => <button key={x} disabled={asking} onClick={() => ask(x)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text">{x}</button>)}</div>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={L('比如：你为什么弃坑？', 'e.g. why did you quit?')} className="flex-1 rounded-lg border border-border bg-panel2 px-3 py-3 text-sm outline-none focus:border-primary/60" />
        <button disabled={asking || !q.trim()} className="rounded-lg bg-primary px-5 text-sm font-semibold text-[#04211c] disabled:opacity-40">{L('问', 'Ask')}</button>
      </form>
    </div>}
  </div>;
}
