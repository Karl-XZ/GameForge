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
  const usable = h - 56; const cx = left + (w - left - (left ? 140 : 0)) / 2, cy = usable / 2; const R = Math.min(w - left - (left ? 140 : 0), usable) * 0.41; const dr = R / (maxGen + 0.35);
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
    const INK = '#1B1A17', INK3 = '#7A7466', PAPER = '#F2EEE4', RED = '#B8401F';
    const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
    const draw = (now: number) => {
      const {geo, hover, focus, champion} = state.current; const t = (now - t0) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const {cx, cy, dr, nodes} = geo; const R = dr * (geo.maxGen + 0.35);
      for (const id of nodes.keys()) if (!born.current.has(id)) born.current.set(id, now);
      // compass ticks around the outer ring, like a printed chart
      ctx.strokeStyle = alpha(INK, 0.22); ctx.lineWidth = 1;
      for (let k = 0; k < 120; k++) {
        const a = (k / 120) * Math.PI * 2; const l = k % 10 === 0 ? 9 : 4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14)); ctx.lineTo(cx + Math.cos(a) * (R + 14 + l), cy + Math.sin(a) * (R + 14 + l)); ctx.stroke();
      }
      ctx.strokeStyle = alpha(INK, 0.5); ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, 7); ctx.stroke();
      // generation rings
      for (let g = 1; g <= geo.maxGen; g++) {
        ctx.strokeStyle = alpha(INK, 0.16); ctx.setLineDash([1.5, 4.5]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, g * dr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        const label = zh ? `第 ${g} 代` : `GEN ${g}`; ctx.font = '11px "Noto Serif SC", serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width; ctx.fillStyle = PAPER; ctx.fillRect(cx - tw / 2 - 5, cy - g * dr - 8, tw + 10, 15);
        ctx.fillStyle = INK3; ctx.fillText(label, cx, cy - g * dr + 4);
      }
      const nodeAt = (id: string | null) => (id ? nodes.get(id) : undefined);
      const path: Node[] = []; let cur = nodeAt(hover || focus || null);
      while (cur) { path.push(cur); cur = nodeAt(cur.s.parent); }
      // edges
      for (const n of nodes.values()) {
        const p = nodeAt(n.s.parent); if (!p) continue;
        const col = geneOf(n.s.gene).color; const lit = path.includes(n); const alive = n.s.status === 'alive';
        const age = Math.min(1, (now - (born.current.get(n.s.id) || 0)) / 900);
        const midR = Math.max(p.ring, n.ring - 0.5) * dr;
        const qx = cx + Math.cos(n.angle) * midR, qy = cy + Math.sin(n.angle) * midR;
        ctx.strokeStyle = lit ? INK : alpha(col, alive ? 0.8 : 0.4); ctx.lineWidth = lit ? 2.4 : alive ? 1.4 : 1;
        if (!alive) ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + (qx - p.x) * age, p.y + (qy - p.y) * age, p.x + (n.x - p.x) * age, p.y + (n.y - p.y) * age); ctx.stroke(); ctx.setLineDash([]);
      }
      // a small mark travelling back along the hovered lineage
      if (path.length > 1) {
        const seg = (t * 1.2) % (path.length - 1); const i = Math.floor(seg); const f = seg - i;
        const a = path[i], b = path[i + 1];
        ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 3, 0, 7); ctx.fill();
      }
      // specimens
      for (const n of nodes.values()) {
        const age = Math.min(1, (now - born.current.get(n.s.id)!) / 900);
        const ease = 1 - Math.pow(1 - age, 3);
        const col = geneOf(n.s.gene).color; const lit = path.includes(n) || n.s.id === hover;
        const r = n.r * ease * (lit ? 1.18 : 1);
        if (age < 1) { ctx.strokeStyle = alpha(col, (1 - age) * 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.x, n.y, r + 26 * age, 0, 7); ctx.stroke(); }
        if (n.s.status === 'alive') {
          ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.5, 0, 7); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
          if (n.s.root || n.s.promoted) { ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.6, r * 0.32), 0, 7); ctx.fill(); }
          if (lit) { ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5, 0, 7); ctx.stroke(); }
          if (n.s.elite) { ctx.strokeStyle = alpha(INK, 0.55); ctx.lineWidth = 1; ctx.setLineDash([2, 2.5]); ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
          if (n.s.id === champion) {
            ctx.strokeStyle = RED; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(n.x, n.y, r + 10, 0, 7); ctx.stroke();
            ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(n.x, n.y, r + 13.5, 0, 7); ctx.stroke();
          }
        } else if (n.s.status === 'embryo') {
          const p = 0.5 + 0.5 * Math.sin(t * 4);
          ctx.strokeStyle = alpha(RED, 0.35 + 0.5 * p); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(n.x, n.y, 5 + 4 * p, 0, 7); ctx.stroke();
          ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(n.x, n.y, 2.4, 0, 7); ctx.fill();
        } else {
          ctx.strokeStyle = n.s.status === 'invalid' ? RED : alpha(INK, 0.6); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(n.x - 4, n.y - 4); ctx.lineTo(n.x + 4, n.y + 4); ctx.moveTo(n.x + 4, n.y - 4); ctx.lineTo(n.x - 4, n.y + 4); ctx.stroke();
        }
      }
      // labels, set like museum captions
      const alive = [...nodes.values()].filter(n => n.s.status === 'alive' && n.s.name).sort((a, b) => (b.s.fitness?.F ?? 0) - (a.s.fitness?.F ?? 0));
      const labelled = new Set<Node>([...alive.slice(0, 3)]);
      for (const id of [champion, hover, focus]) { const n = nodeAt(id || null); if (n && n.s.name) labelled.add(n); }
      const root = [...nodes.values()].find(n => n.s.parent === null); if (root && root.s.name) labelled.add(root);
      const boxes: [number, number, number, number][] = [];
      for (const n of labelled) {
        let right = n.x >= cx; let lx = n.x + (right ? 22 : -22), ly = n.y - 12;
        const hit = (x: number, y: number, r: boolean) => boxes.some(b => { const x0 = r ? x : x - 190, x1 = r ? x + 190 : x; return x0 < b[2] && x1 > b[0] && y - 18 < b[3] && y + 34 > b[1]; });
        for (let k = 0; k < 6 && hit(lx, ly, right); k++) {
          if (k === 0) { right = !right; lx = n.x + (right ? 22 : -22); continue; }
          ly += 46 * (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        }
        boxes.push([right ? lx : lx - 190, ly - 18, right ? lx + 190 : lx, ly + 34]);
        const meta = `${n.s.id === champion ? (zh ? '冠军 · ' : 'CHAMPION · ') : ''}${zh ? `第 ${n.s.gen} 代` : `GEN ${n.s.gen}`} · ${zh ? geneOf(n.s.gene).zh : geneOf(n.s.gene).en} · F ${fmt(n.s.fitness?.F)}`;
        ctx.font = '600 16px "Noto Serif SC", serif'; const w1 = ctx.measureText(n.s.name).width;
        ctx.font = 'italic 14px "Instrument Serif", Georgia, serif'; const w2 = ctx.measureText(n.s.latin || '').width;
        ctx.font = '10px "IBM Plex Mono", monospace'; const w3 = ctx.measureText(meta).width;
        const bw = Math.max(w1, w2, w3) + 14; const tx = lx + (right ? 9 : -9);
        ctx.fillStyle = alpha(PAPER, 0.88); ctx.fillRect(right ? lx : lx - bw, ly - 16, bw, 52);
        ctx.strokeStyle = alpha(INK, 0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(n.x + (right ? n.r + 4 : -n.r - 4), n.y); ctx.lineTo(lx, ly + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 34); ctx.stroke();
        ctx.textAlign = right ? 'left' : 'right';
        ctx.fillStyle = INK; ctx.font = '600 16px "Noto Serif SC", serif'; ctx.fillText(n.s.name, tx, ly + 2);
        ctx.fillStyle = INK3; ctx.font = 'italic 14px "Instrument Serif", Georgia, serif'; ctx.fillText(n.s.latin || '', tx, ly + 18);
        ctx.fillStyle = n.s.id === champion ? RED : INK3; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillText(meta, tx, ly + 31);
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
    <canvas ref={cv} className={`absolute inset-0 h-full w-full ${hover ? 'cursor-pointer' : 'cursor-default'}`} onMouseMove={e => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={e => { const id = pick(e); if (id) onOpen(id); }} />
    {hovered && hovered.status !== 'alive' && <div className="pointer-events-none absolute bottom-16 left-0 z-20 max-w-[320px] border border-ink bg-card p-4 text-[12px] leading-5 text-ink2 shadow-plate lg:left-[340px]">
      <div className="font-serif text-[15px] font-semibold text-ink">{hovered.name || hovered.id}</div>
      <div className="mt-0.5">{hovered.status === 'embryo' ? (zh ? '胚胎 · 正在制作与试玩' : 'Embryo · being built and played') : hovered.status === 'stillborn' ? (zh ? '夭折 · 制作未通过校验' : 'Stillborn · build failed validation') : (zh ? '淘汰 · 真实试玩中崩溃' : 'Invalid · crashed in real play')}</div>
      {hovered.error && <div className="mt-1.5 font-mono text-[11px] text-vermilion">{hovered.error}</div>}
      {hovered.play?.errors?.[0] && <div className="mt-1.5 font-mono text-[11px] text-vermilion">{hovered.play.errors[0].slice(0, 160)}</div>}
    </div>}
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 border-t border-ink bg-paper pt-3 lg:left-[340px]">
      <button className="btn-quiet py-1.5 text-[12px]" onClick={() => setPlaying(true)} disabled={playing || maxGen === 0}>▶ {zh ? '回放进化' : 'Replay'}</button>
      <span className="w-16 font-mono text-[11px] text-ink2 num">{zh ? `第 ${cutoff ?? maxGen} 代` : `GEN ${cutoff ?? maxGen}`}</span>
      <input aria-label="generation" type="range" min={0} max={Math.max(1, maxGen)} value={cutoff ?? maxGen} onChange={e => setCutoff(Number(e.target.value) >= maxGen ? null : Number(e.target.value))} className="scrub flex-1" />
      {live && <span className="flex items-center gap-2 font-mono text-[11px] text-vermilion"><span className="breathe inline-block h-2 w-2 rounded-full bg-vermilion" />{zh ? `进化中 · 第 ${generation ?? 0} 代` : `EVOLVING · GEN ${generation ?? 0}`}</span>}
      {likes && <span className="hidden font-mono text-[11px] text-ink3 md:inline">♥ {Object.values(likes).reduce((a, b) => a + b, 0)} {zh ? '次真人选择' : 'human picks'}</span>}
    </div>
  </div>;
}
