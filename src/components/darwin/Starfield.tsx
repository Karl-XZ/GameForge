'use client';
import {useEffect, useRef} from 'react';

/** Fixed, low-cost animated starfield with drifting nebula dust (never a flat black backdrop). */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    let w = 0, h = 0, raf = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
    let rand = 1234567; const rnd = () => ((rand = (rand * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({length: 380}, () => ({x: rnd(), y: rnd(), z: rnd() * 0.9 + 0.1, t: rnd() * 6.28, c: rnd()}));
    let shoot: {x: number; y: number; vx: number; vy: number; life: number} | null = null;
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const x = ((s.x + t * 0.002 * s.z) % 1) * w, y = s.y * h;
        const a = 0.25 + 0.55 * s.z * (0.6 + 0.4 * Math.sin(t * (0.6 + s.z) + s.t));
        ctx.fillStyle = s.c > 0.92 ? `rgba(242,182,109,${a})` : s.c > 0.82 ? `rgba(94,234,212,${a})` : `rgba(220,230,245,${a})`;
        const r = s.z * 1.25;
        ctx.fillRect(x, y, r, r);
      }
      if (!shoot && Math.random() < 0.003) shoot = {x: Math.random() * w * 0.7, y: Math.random() * h * 0.4, vx: 6 + Math.random() * 4, vy: 2 + Math.random() * 2, life: 1};
      if (shoot) {
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14);
        g.addColorStop(0, `rgba(255,255,255,${shoot.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14); ctx.stroke();
        shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= 0.012; if (shoot.life <= 0) shoot = null;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
