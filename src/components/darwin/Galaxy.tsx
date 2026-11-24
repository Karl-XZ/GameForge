'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {geneOf, type Species, fmt} from './common';

type Node = {s: Species; x: number; y: number; r: number; angle: number; ring: number; depth: number};

function layout(species: Species[], w: number, h: number, left = 0) {
  const byParent = new Map<string | null, Species[]>();
  for (const s of species) { const k = s.parent; byParent.set(k, [...(byParent.get(k) || []), s]); }
  const roots = byParent.get(null) || [];
  const leaves = (s: Species): number => { const c = byParent.get(s.id) || []; return c.length ? c.reduce((a, x) => a + leaves(x), 0) : 1; };
  const maxGen = Math.max(1, ...species.map(s => s.gen));
  const cx = left + (w - left) / 2, cy = h / 2 - 10; const R = Math.min(w - left, h) * 0.43; const dr = R / (maxGen + 0.35);
  const nodes = new Map<string, Node>();
  const place = (s: Species, a0: number, a1: number, depth: number) => {
    const angle = (a0 + a1) / 2;
    const ring = s.parent === null ? 0 : s.gene === 'repair' ? 0.45 : s.gen + (s.gen === 0 ? 0.45 : 0);
    const rad = ring * dr;
    const size = s.status === 'alive' ? 4 + 9 * (s.fitness?.F ?? 0.3) : 3;
    nodes.set(s.id, {s, x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad, r: size, angle, ring, depth});
    const kids = (byParent.get(s.id) || []).sort((a, b) => a.id.localeCompare(b.id));
    const total = kids.reduce((a, k) => a + leaves(k), 0) || 1;
    let cur = a0;
    for (const k of kids) { const span = (a1 - a0) * leaves(k) / total; place(k, cur, cur + span, depth + 1); cur += span; }
  };
  const total = roots.reduce((a, r) => a + leaves(r), 0) || 1; let cur = -Math.PI / 2;
  for (const r of roots) { const span = Math.PI * 2 * leaves(r) / total; place(r, cur, cur + span, 0); cur += span; }
  return {nodes, cx, cy, dr, maxGen};
}

export function Galaxy({species, champion, focus, onOpen, locale, live, generation, likes, offsetLeft = 0}: {
  offsetLeft?: number; species: Species[]; champion?: string | null; focus?: string | null; onOpen: (sid: string) => void; locale: string; live?: boolean; generation?: number; likes?: Record<string, number>;
}) {
  const wrap = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({w: 900, h: 640});
  const [hover, setHover] = useState<string | null>(null);
  const maxGen = Math.max(0, ...species.map(s => s.gen));
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shown = useMemo(() => species.filter(s => cutoff === null || s.gen <= cutoff), [species, cutoff]);
  const geo = useMemo(() => layout(shown, size.w, size.h, size.w > 1000 ? offsetLeft : 0), [shown, size, offsetLeft]);
  const born = useRef(new Map<string, number>());
  const state = useRef({geo, hover, focus, champion, locale});
  state.current = {geo, hover, focus, champion, locale};
  const zh = locale === 'zh';

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({w: e.contentRect.width, h: e.contentRect.height}));
    ro.observe(wrap.current!); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    let g = 0; setCutoff(0);
    const t = setInterval(() => { g++; if (g > maxGen) { clearInterval(t); setPlaying(false); setCutoff(null); } else setCutoff(g); }, 1400);
    return () => clearInterval(t);
  }, [playing, maxGen]);

  useEffect(() => {
    const canvas = cv.current!; const ctx = canvas.getContext('2d')!; let raf = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const t0 = performance.now();
    const dust = Array.from({length: 260}, (_, i) => ({a: (i * 2.399) % (Math.PI * 2), r: 0.05 + ((i * 0.6180339) % 1) * 1.05, s: 0.02 + ((i * 0.37) % 1) * 0.06, z: (i * 0.731) % 1}));
    const draw = (now: number) => {
      const {geo, hover, focus, champion} = state.current; const t = (now - t0) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const {cx, cy, dr, nodes} = geo; const R = dr * (geo.maxGen + 0.35);
      for (const id of nodes.keys()) if (!born.current.has(id)) born.current.set(id, now);
      // core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      core.addColorStop(0, 'rgba(94,234,212,0.10)'); core.addColorStop(0.35, 'rgba(167,139,250,0.05)'); core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, 7); ctx.fill();
      // generation rings
      for (let g = 1; g <= geo.maxGen; g++) {
        ctx.strokeStyle = 'rgba(148,163,184,0.10)'; ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, g * dr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(148,163,184,0.45)'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(zh ? `第 ${g} 代` : `GEN ${g}`, cx, cy - g * dr - 6);
      }
      // orbiting dust
      for (const d of dust) {
        const a = d.a + t * d.s * 0.4; const r = d.r * R;
        ctx.fillStyle = `rgba(200,220,255,${0.08 + d.z * 0.18})`;
        ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.98, 1.1, 1.1);
      }
      const nodeAt = (id: string | null) => (id ? nodes.get(id) : undefined);
      const path: Node[] = []; let cur = nodeAt(hover || focus || null);
      while (cur) { path.push(cur); cur = nodeAt(cur.s.parent); }
      // edges
      for (const n of nodes.values()) {
        const p = nodeAt(n.s.parent); if (!p) continue;
        const col = geneOf(n.s.gene).color; const lit = path.includes(n);
        const age = Math.min(1, (now - (born.current.get(n.s.id) || 0)) / 900);
        const midA = n.angle; const midR = Math.max(p.ring, n.ring - 0.5) * dr;
        const qx = cx + Math.cos(midA) * midR, qy = cy + Math.sin(midA) * midR;
        const g = ctx.createLinearGradient(p.x, p.y, n.x, n.y);
        g.addColorStop(0, 'rgba(232,237,243,0.15)'); g.addColorStop(1, col + (n.s.status === 'alive' ? (lit ? 'ff' : 'aa') : '44'));
        ctx.strokeStyle = g; ctx.lineWidth = lit ? 2.4 : n.s.status === 'alive' ? 1.3 : 0.8;
        if (n.s.status !== 'alive') ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        const ex = p.x + (n.x - p.x) * age, ey = p.y + (n.y - p.y) * age;
        ctx.quadraticCurveTo(p.x + (qx - p.x) * age, p.y + (qy - p.y) * age, ex, ey); ctx.stroke(); ctx.setLineDash([]);
      }
      // lineage pulse travelling back to the origin
      if (path.length > 1) {
        const seg = (t * 1.6) % (path.length - 1); const i = Math.floor(seg); const f = seg - i;
        const a = path[i], b = path[i + 1];
        const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(0.3, geneOf(a.s.gene).color + 'aa'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
      }
      // stars
      for (const n of nodes.values()) {
        const age = Math.min(1, (now - born.current.get(n.s.id)!) / 900);
        const ease = 1 - Math.pow(1 - age, 3);
        const col = geneOf(n.s.gene).color; const lit = path.includes(n) || n.s.id === hover;
        const r = n.r * ease * (lit ? 1.25 : 1);
        if (age < 1) { ctx.strokeStyle = col + Math.round((1 - age) * 200).toString(16).padStart(2, '0'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, r + 30 * age, 0, 7); ctx.stroke(); }
        if (n.s.status === 'alive') {
          const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.5);
          halo.addColorStop(0, col + 'aa'); halo.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * 4.5, 0, 7); ctx.fill();
          ctx.fillStyle = n.s.promoted || n.s.root ? '#ffffff' : col; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.x, n.y, r + 1.5, 0, 7); ctx.stroke();
          if (n.s.elite) { ctx.strokeStyle = 'rgba(232,237,243,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, 0, 7); ctx.stroke(); }
          if (n.s.id === champion) {
            const spin = t * 0.8;
            ctx.strokeStyle = '#f2b66d'; ctx.lineWidth = 1.6;
            for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 11, spin + k * Math.PI / 2, spin + k * Math.PI / 2 + 0.9); ctx.stroke(); }
          }
        } else if (n.s.status === 'embryo') {
          const p = 0.5 + 0.5 * Math.sin(t * 5);
          ctx.strokeStyle = `rgba(94,234,212,${0.4 + 0.5 * p})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.x, n.y, 5 + 4 * p, 0, 7); ctx.stroke();
          ctx.fillStyle = 'rgba(94,234,212,0.9)'; ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, 7); ctx.fill();
        } else {
          ctx.strokeStyle = n.s.status === 'invalid' ? 'rgba(255,107,107,0.75)' : 'rgba(148,163,184,0.55)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(n.x - 4, n.y - 4); ctx.lineTo(n.x + 4, n.y + 4); ctx.moveTo(n.x + 4, n.y - 4); ctx.lineTo(n.x - 4, n.y + 4); ctx.stroke();
        }
      }
      // labels
      const alive = [...nodes.values()].filter(n => n.s.status === 'alive' && n.s.name).sort((a, b) => (b.s.fitness?.F ?? 0) - (a.s.fitness?.F ?? 0));
      const labelled = new Set<Node>([...alive.slice(0, 3)]);
      for (const id of [champion, hover, focus]) { const n = nodeAt(id || null); if (n && n.s.name) labelled.add(n); }
      const boxes: [number, number, number, number][] = [];
      for (const n of labelled) {
        let right = n.x >= cx; let lx = n.x + (right ? 18 : -18), ly = n.y - 12;
        const hit = (x: number, y: number, r: boolean) => boxes.some(b => { const x0 = r ? x : x - 190, x1 = r ? x + 190 : x; return x0 < b[2] && x1 > b[0] && y - 18 < b[3] && y + 34 > b[1]; });
        for (let k = 0; k < 6 && hit(lx, ly, right); k++) {
          if (k === 0) { right = !right; lx = n.x + (right ? 18 : -18); continue; }
          ly += 44 * (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        }
        boxes.push([right ? lx : lx - 190, ly - 18, right ? lx + 190 : lx, ly + 34]);
        ctx.strokeStyle = 'rgba(232,237,243,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 26); ctx.stroke();
        ctx.textAlign = right ? 'left' : 'right'; const tx = lx + (right ? 8 : -8);
        ctx.fillStyle = '#f5f7fa'; ctx.font = '600 17px "Noto Serif SC", serif'; ctx.fillText(n.s.name, tx, ly + 2);
        ctx.fillStyle = 'rgba(232,237,243,0.6)'; ctx.font = 'italic 12px Georgia, serif'; ctx.fillText(n.s.latin || '', tx, ly + 17);
        ctx.fillStyle = n.s.id === champion ? '#f2b66d' : geneOf(n.s.gene).color; ctx.font = '10px "JetBrains Mono", monospace';
        const meta = `${n.s.id === champion ? (zh ? '冠军 · ' : 'CHAMPION · ') : ''}${zh ? `第 ${n.s.gen} 代` : `GEN ${n.s.gen}`} · ${zh ? geneOf(n.s.gene).zh : geneOf(n.s.gene).en} · F ${fmt(n.s.fitness?.F)}`;
        ctx.fillText(meta, tx, ly + 31);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [zh]);

  useEffect(() => { // test/automation hook: star screen positions
    const rect = cv.current?.getBoundingClientRect();
    (window as any).__galaxy = [...geo.nodes.values()].map(n => ({id: n.s.id, name: n.s.name, status: n.s.status, F: n.s.fitness?.F ?? 0, x: (rect?.left || 0) + n.x, y: (rect?.top || 0) + n.y}));
  }, [geo]);
  const pick = (e: React.MouseEvent) => {
    const rect = cv.current!.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best: string | null = null, bd = 22;
    for (const n of geo.nodes.values()) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n.s.id; } }
    return best;
  };
  const hovered = hover ? species.find(s => s.id === hover) : null;
  return <div className="relative h-full w-full" ref={wrap}>
    <canvas ref={cv} className="absolute inset-0 h-full w-full cursor-crosshair" onMouseMove={e => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={e => { const id = pick(e); if (id) onOpen(id); }} />
    {hovered && hovered.status !== 'alive' && <div className="pointer-events-none absolute left-4 top-4 max-w-sm rounded-xl glass p-3 text-xs text-muted">
      <div className="font-serif text-base text-text">{hovered.name || hovered.id}</div>
      <div>{hovered.status === 'embryo' ? (zh ? '胚胎 · 正在制作与试玩' : 'Embryo · being built and played') : hovered.status === 'stillborn' ? (zh ? '夭折 · 制作未通过校验' : 'Stillborn · build failed validation') : (zh ? '淘汰 · 真实试玩中崩溃' : 'Invalid · crashed in real play')}</div>
      {hovered.error && <div className="mt-1 text-rose/80">{hovered.error}</div>}
      {hovered.play?.errors?.[0] && <div className="mt-1 text-rose/80">{hovered.play.errors[0].slice(0, 160)}</div>}
    </div>}
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 pb-1">
      <button className="label-mono rounded-full border border-border px-3 py-1.5 text-text hover:border-primary/60" onClick={() => setPlaying(true)} disabled={playing || maxGen === 0}>▶ {zh ? '回放进化' : 'Replay'}</button>
      <span className="label-mono w-20 text-text">{zh ? `第 ${cutoff ?? maxGen} 代` : `GEN ${cutoff ?? maxGen}`}</span>
      <input aria-label="generation" type="range" min={0} max={Math.max(1, maxGen)} value={cutoff ?? maxGen} onChange={e => setCutoff(Number(e.target.value) >= maxGen ? null : Number(e.target.value))} className="flex-1 accent-[#5eead4]" />
      {live && <span className="label-mono flex items-center gap-2 text-primary"><span className="pulse-ring inline-block h-2 w-2 rounded-full bg-primary" />{zh ? `进化中 · 第 ${generation ?? 0} 代` : `EVOLVING · GEN ${generation ?? 0}`}</span>}
      {likes && <span className="label-mono hidden md:inline">♥ {Object.values(likes).reduce((a, b) => a + b, 0)}</span>}
    </div>
  </div>;
}
