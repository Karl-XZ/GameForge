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
  const usable = h - 60; const cx = left + (w - left - (left ? 160 : 0)) / 2, cy = usable / 2 + 6; const R = Math.min(w - left - (left ? 160 : 0), usable) * 0.40; const dr = R / (maxGen + 0.35);
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
    const JET = '#0B0B0D', WHITE = '#FFFFFF', RED = '#E8132E', VOLT = '#FFE135';
    const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
    const burst = (x: number, y: number, r0: number, r1: number, spikes: number, rot: number) => {
      ctx.beginPath();
      for (let k = 0; k < spikes * 2; k++) { const a = rot + (k / (spikes * 2)) * Math.PI * 2; const r = k % 2 ? r0 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      ctx.closePath();
    };
    const slab = (x: number, y: number, w: number, h: number, sk: number) => { ctx.beginPath(); ctx.moveTo(x + sk, y); ctx.lineTo(x + w + sk, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x - sk, y + h); ctx.closePath(); };
    const draw = (now: number) => {
      const {geo, hover, focus, champion} = state.current; const t = Math.max(0, now - t0) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const {cx, cy, dr, nodes} = geo; const R = dr * (geo.maxGen + 0.35);
      for (const id of nodes.keys()) if (!born.current.has(id)) born.current.set(id, now);
      // outer dial: white ring with red majors, like a game HUD
      ctx.lineWidth = 2; ctx.strokeStyle = alpha(WHITE, 0.55); ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, 7); ctx.stroke();
      for (let k = 0; k < 96; k++) {
        const a = (k / 96) * Math.PI * 2 + t * 0.02; const major = k % 8 === 0; const l = major ? 12 : 5;
        ctx.strokeStyle = major ? RED : alpha(WHITE, 0.35); ctx.lineWidth = major ? 4 : 1.5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22)); ctx.lineTo(cx + Math.cos(a) * (R + 22 + l), cy + Math.sin(a) * (R + 22 + l)); ctx.stroke();
      }
      // generation rings with slanted red tags
      for (let g = 1; g <= geo.maxGen; g++) {
        ctx.strokeStyle = alpha(WHITE, 0.16); ctx.setLineDash([3, 7]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, g * dr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        const label = zh ? `第 ${g} 代` : `GEN ${g}`; ctx.font = 'italic 800 12px "Barlow Condensed", "Noto Sans SC", sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width; slab(cx - tw / 2 - 7, cy - g * dr - 9, tw + 14, 17, 3); ctx.fillStyle = RED; ctx.fill();
        ctx.fillStyle = WHITE; ctx.fillText(label, cx, cy - g * dr + 4);
      }
      const nodeAt = (id: string | null) => (id ? nodes.get(id) : undefined);
      const path: Node[] = []; let cur = nodeAt(hover || focus || null);
      while (cur) { path.push(cur); cur = nodeAt(cur.s.parent); }
      // edges
      const curve = (n: Node, p: Node, age: number) => {
        const midR = Math.max(p.ring, n.ring - 0.5) * dr;
        const qx = cx + Math.cos(n.angle) * midR, qy = cy + Math.sin(n.angle) * midR;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + (qx - p.x) * age, p.y + (qy - p.y) * age, p.x + (n.x - p.x) * age, p.y + (n.y - p.y) * age);
      };
      for (const n of nodes.values()) {
        const p = nodeAt(n.s.parent); if (!p || path.includes(n)) continue;
        const col = geneOf(n.s.gene).color; const alive = n.s.status === 'alive';
        const age = Math.min(1, (now - (born.current.get(n.s.id) || 0)) / 700);
        ctx.strokeStyle = alpha(col, alive ? 0.9 : 0.4); ctx.lineWidth = alive ? 2.6 : 1.5;
        if (!alive) ctx.setLineDash([4, 4]);
        curve(n, p, age); ctx.stroke(); ctx.setLineDash([]);
      }
      // the hovered lineage, inked: black casing, white core
      for (const n of path) {
        const p = nodeAt(n.s.parent); if (!p) continue;
        ctx.lineCap = 'round';
        ctx.strokeStyle = JET; ctx.lineWidth = 8; curve(n, p, 1); ctx.stroke();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 4; curve(n, p, 1); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      if (path.length > 1) {
        const seg = (t * 1.4) % (path.length - 1); const i = Math.floor(seg); const f = seg - i;
        const a = path[i], b = path[i + 1]; const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = VOLT; ctx.strokeStyle = JET; ctx.lineWidth = 2; ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeRect(-4.5, -4.5, 9, 9); ctx.restore();
      }
      // specimens: keylined stickers
      for (const n of nodes.values()) {
        const age = Math.min(1, (now - born.current.get(n.s.id)!) / 700);
        const ease = age < 1 ? 1 + Math.sin(age * Math.PI) * 0.35 * (1 - age) : 1; // overshoot pop-in
        const col = geneOf(n.s.gene).color; const lit = path.includes(n) || n.s.id === hover;
        const r = n.r * Math.min(1, age * 1.6) * ease * (lit ? 1.2 : 1);
        if (age < 1) { ctx.strokeStyle = alpha(WHITE, (1 - age) * 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r + 30 * age, 0, 7); ctx.stroke(); }
        if (n.s.status === 'alive') {
          if (n.s.id === champion) {
            burst(n.x, n.y, r + 9, r + 19, 12, t * 0.6); ctx.fillStyle = VOLT; ctx.fill(); ctx.strokeStyle = JET; ctx.lineWidth = 2.5; ctx.stroke();
          }
          if (n.s.elite) { ctx.strokeStyle = alpha(WHITE, 0.85); ctx.lineWidth = 1.8; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
          ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(n.x, n.y, r + 4, 0, 7); ctx.fill();
          ctx.fillStyle = JET; ctx.beginPath(); ctx.arc(n.x, n.y, r + 2, 0, 7); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
          if (n.s.root || n.s.promoted) { ctx.fillStyle = JET; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.8, r * 0.34), 0, 7); ctx.fill(); }
          if (lit) { ctx.strokeStyle = VOLT; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r + 6.5, 0, 7); ctx.stroke(); }
        } else if (n.s.status === 'embryo') {
          const p = 0.5 + 0.5 * Math.sin(t * 5);
          ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.PI / 4 + t);
          ctx.strokeStyle = alpha(RED, 0.5 + 0.5 * p); ctx.lineWidth = 3; const q = 6 + 4 * p; ctx.strokeRect(-q, -q, q * 2, q * 2);
          ctx.fillStyle = WHITE; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
        } else {
          ctx.lineCap = 'square';
          for (const [c, lw] of [[WHITE, 6], [n.s.status === 'invalid' ? RED : '#8A8A90', 3]] as const) {
            ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(n.x - 5, n.y - 5); ctx.lineTo(n.x + 5, n.y + 5); ctx.moveTo(n.x + 5, n.y - 5); ctx.lineTo(n.x - 5, n.y + 5); ctx.stroke();
          }
          ctx.lineCap = 'butt';
        }
      }
      // labels: slanted name cards with a hard drop
      const alive = [...nodes.values()].filter(n => n.s.status === 'alive' && n.s.name).sort((a, b) => (b.s.fitness?.F ?? 0) - (a.s.fitness?.F ?? 0));
      const labelled = new Set<Node>([...alive.slice(0, 3)]);
      for (const id of [champion, hover, focus]) { const n = nodeAt(id || null); if (n && n.s.name) labelled.add(n); }
      const root = [...nodes.values()].find(n => n.s.parent === null); if (root && root.s.name) labelled.add(root);
      const boxes: [number, number, number, number][] = [];
      for (const n of labelled) {
        let right = n.x >= cx; let lx = n.x + (right ? 26 : -26), ly = n.y - 12;
        const hit = (x: number, y: number, r: boolean) => boxes.some(b => { const x0 = r ? x : x - 200, x1 = r ? x + 200 : x; return x0 < b[2] && x1 > b[0] && y - 20 < b[3] && y + 38 > b[1]; });
        for (let k = 0; k < 6 && hit(lx, ly, right); k++) {
          if (k === 0) { right = !right; lx = n.x + (right ? 26 : -26); continue; }
          ly += 50 * (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        }
        boxes.push([right ? lx : lx - 200, ly - 20, right ? lx + 200 : lx, ly + 38]);
        const champ = n.s.id === champion;
        const meta = `${champ ? (zh ? '冠军 · ' : 'CHAMPION · ') : ''}${zh ? `第 ${n.s.gen} 代` : `GEN ${n.s.gen}`} · ${zh ? geneOf(n.s.gene).zh : geneOf(n.s.gene).en} · F ${fmt(n.s.fitness?.F)}`;
        const F1 = '900 16px "Noto Sans SC", "PingFang SC", sans-serif', F2 = 'italic 700 13px "Barlow Condensed", sans-serif', F3 = '600 10px "JetBrains Mono", monospace';
        ctx.font = F1; const w1 = ctx.measureText(n.s.name).width;
        ctx.font = F2; const w2 = ctx.measureText(n.s.latin || '').width;
        ctx.font = F3; const w3 = ctx.measureText(meta).width;
        const bw = Math.max(w1, w2, w3) + 22; const bx = right ? lx : lx - bw; const by = ly - 17, bh = 54;
        ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(n.x + (right ? n.r + 5 : -n.r - 5), n.y); ctx.lineTo(right ? bx : bx + bw, ly + 10); ctx.stroke();
        slab(bx + 5, by + 5, bw, bh, 5); ctx.fillStyle = champ ? VOLT : RED; ctx.fill();
        slab(bx, by, bw, bh, 5); ctx.fillStyle = champ ? RED : WHITE; ctx.fill(); ctx.strokeStyle = JET; ctx.lineWidth = 2.5; ctx.stroke();
        const tx = bx + 11; ctx.textAlign = 'left';
        ctx.fillStyle = champ ? WHITE : JET; ctx.font = F1; ctx.fillText(n.s.name, tx + 2, ly + 3);
        ctx.fillStyle = champ ? alpha(WHITE, 0.85) : '#55555B'; ctx.font = F2; ctx.fillText(n.s.latin || '', tx, ly + 19);
        ctx.fillStyle = champ ? WHITE : RED; ctx.font = F3; ctx.fillText(meta, tx - 2, ly + 32);
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
  const padL = size.w > 1000 ? offsetLeft : 0;
  return <div className="relative h-full w-full" ref={wrap}>
    <canvas ref={cv} className={`absolute inset-0 h-full w-full ${hover ? 'cursor-pointer' : 'cursor-default'}`} onMouseMove={e => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={e => { const id = pick(e); if (id) onOpen(id); }} />
    {hovered && hovered.status !== 'alive' && <div className="pointer-events-none absolute bottom-20 z-20 max-w-[330px] border-[3px] border-jet bg-snow p-4 text-[12px] leading-5 text-ink2 shadow-hard-red" style={{left: padL + 16}}>
      <div className="heavy text-[16px] text-jet">{hovered.name || hovered.id}</div>
      <div className="mt-1"><span className={`tag ${hovered.status === 'embryo' ? 'tag-volt' : 'tag-red'}`}><span>{hovered.status === 'embryo' ? (zh ? '胚胎 · 正在制作与试玩' : 'Embryo · being built and played') : hovered.status === 'stillborn' ? (zh ? '夭折 · 制作未通过校验' : 'Stillborn · build failed validation') : (zh ? '淘汰 · 真实试玩中崩溃' : 'Invalid · crashed in real play')}</span></span></div>
      {hovered.error && <div className="mt-2 font-mono text-[11px] text-pop">{hovered.error}</div>}
      {hovered.play?.errors?.[0] && <div className="mt-2 font-mono text-[11px] text-pop">{hovered.play.errors[0].slice(0, 160)}</div>}
    </div>}
    <div className="absolute bottom-0 right-0 z-10 flex items-center gap-4 border-t-[3px] border-snow/15 bg-jet/80 px-4 py-3 text-snow" style={{left: padL ? padL + 16 : 0}}>
      <button className="btn-red py-1.5 text-[14px]" onClick={() => setPlaying(true)} disabled={playing || maxGen === 0}>▶ {zh ? '回放进化' : 'Replay'}</button>
      <span className="w-20 font-display text-[16px] num">{zh ? `第 ${cutoff ?? maxGen} 代` : `GEN ${cutoff ?? maxGen}`}</span>
      <input aria-label="generation" type="range" min={0} max={Math.max(1, maxGen)} value={cutoff ?? maxGen} onChange={e => setCutoff(Number(e.target.value) >= maxGen ? null : Number(e.target.value))} className="scrub flex-1 text-snow" />
      {live && <span className="tag tag-volt"><span className="breathe inline-block h-2 w-2 rotate-45 bg-pop" /><span>{zh ? `进化中 · 第 ${generation ?? 0} 代` : `EVOLVING · GEN ${generation ?? 0}`}</span></span>}
      {likes && <span className="hidden font-mono text-[11px] text-snow/60 md:inline"><span className="text-pop">♥</span> {Object.values(likes).reduce((a, b) => a + b, 0)} {zh ? '次真人选择' : 'human picks'}</span>}
    </div>
  </div>;
}
