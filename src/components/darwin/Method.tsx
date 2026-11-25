'use client';
import type {ReactNode} from 'react';
import {fmt, geneOf, type Run} from './common';

function spearman(a: number[], b: number[]) {
  const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = Array(v.length); idx.forEach(([, i], k) => (r[i] = k)); return r; };
  const ra = rank(a), rb = rank(b); const n = a.length; const d = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
  return 1 - (6 * d) / (n * (n * n - 1));
}

export function Method({runs, likes, locale}: {runs: Run[]; likes: Record<string, number>; locale: string}) {
  const zh = locale === 'zh'; const L = (a: string, b: string) => (zh ? a : b);
  const run = runs[0]; const species = run?.evolution?.species || [];
  const gens = Math.max(0, ...species.map(s => s.gen));
  const series = Array.from({length: gens + 1}, (_, g) => {
    const alive = species.filter(s => s.gen <= g && s.status === 'alive');
    const at = species.filter(s => s.gen === g);
    return {g, best: Math.max(0, ...alive.map(s => s.fitness?.F ?? 0)), mean: at.filter(s => s.status === 'alive').reduce((a, s) => a + (s.fitness?.F ?? 0), 0) / Math.max(1, at.filter(s => s.status === 'alive').length), born: at.length, dead: at.filter(s => s.status !== 'alive').length};
  });
  const pairs = runs.flatMap(r => (r.evolution?.species || []).filter(s => s.status === 'alive' && s.society).map(s => [s.society!.S, likes[`${r.id}:${s.id}`] || 0]));
  const liked = pairs.filter(p => p[1] > 0).length;
  const rho = pairs.length >= 5 && liked >= 3 ? spearman(pairs.map(p => p[0]), pairs.map(p => p[1])) : null;
  const W = 520, H = 200, px = (g: number) => 40 + (g / Math.max(1, gens)) * (W - 60), py = (v: number) => H - 30 - v * (H - 50);
  const steps = [
    {k: L('制作', 'Make'), d: L('语义变异算子选一个基因 → 精确文本编辑 → node --check 语法校验', 'Semantic mutation picks one gene → exact text edits → node --check'), c: '#B8401F'},
    {k: L('试玩', 'Play'), d: L('隔离沙箱里三种玩家人设真实按键：萌新 / 速通 / 探索', 'Isolated sandbox, real key input by newbie / speedrunner / explorer'), c: '#2E6E5C'},
    {k: L('评审', 'Review'), d: L('与亲本做 A/B + B/A 双顺序盲评，引用必须是真实证据路径', 'Reversed blind A/B vs parent; citations must exist'), c: '#2C4A7E'},
    {k: L('社会', 'Society'), d: L('10 类玩家人设基于真实轨迹发帖，7 天口碑在关注图上扩散', '10 personas post from real trajectories; 7-day word of mouth'), c: '#A86F1A'},
    {k: L('选择', 'Select'), d: L('适应度 + MAP-Elites 生态位 + 锦标赛选亲本，冠军必须赢下双盲评', 'Fitness + MAP-Elites niches + tournament; champion must win both reviews'), c: '#7D8326'},
  ];
  const v = (x: string) => (zh ? <span className="font-serif text-[0.78em] font-semibold">{x}</span> : <i>{x}</i>);
  const H2 = ({n, children}: {n: string; children: ReactNode}) => <div className="mb-5 flex items-baseline gap-3 border-b border-ink pb-2"><span className="font-mono text-[11px] text-ink3">{n}</span><h3 className="font-serif text-[19px] font-semibold">{children}</h3></div>;
  return <div className="fade-up space-y-20 pb-4">
    <section className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <div className="eyebrow">{L('方法', 'Method')}</div>
        <h2 className="mt-5 font-serif text-[44px] font-bold leading-[1.18] md:text-[52px]">{L('游戏不是被设计出来的，', 'Games are not designed;')}<br /><span className="text-vermilion">{L('是被试玩和选择出来的。', 'they are played and selected.')}</span></h2>
        <p className="mt-7 max-w-xl text-[16px] leading-[1.95] text-ink2"><span className="float-left mr-2 mt-1 font-serif text-[56px] font-bold leading-[0.85] text-ink">{L('G', 'G')}</span>{L('ameForge 先用一句话生成可玩的游戏；达尔文进化把它当作第 0 代，沿用 GameForge 的「制作 → 试玩 → 评审」流水线繁衍后代：每一代都要在隔离环境里被真实按键试玩、被盲评、被模拟玩家社会讨论，只有赢下证据的个体才能继续繁衍。', 'ameForge turns one sentence into a playable game. Darwin Evolution treats it as generation 0 and breeds offspring through the same make → play → review pipeline: every child is really played in isolation, blindly reviewed and discussed by a simulated player society; only evidence-backed winners reproduce.')}</p>
      </div>
      <figure className="lg:col-span-6">
        <svg viewBox="0 0 560 380" className="w-full">
          <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L9,5 L0,9" fill="none" stroke="#1B1A17" strokeWidth="1.3" /></marker></defs>
          <circle cx="280" cy="185" r="136" fill="none" stroke="#1B1A17" strokeOpacity=".18" strokeDasharray="1.5 5" />
          <text x="280" y="180" textAnchor="middle" fill="#1B1A17" fontSize="22" fontWeight="700" fontFamily="'Noto Serif SC', serif">{L('一代', 'One generation')}</text>
          <text x="280" y="204" textAnchor="middle" fill="#7A7466" fontSize="11" fontFamily="'IBM Plex Mono', monospace">≈ 6 {L('次模型调用 / 后代', 'calls / child')}</text>
          {steps.map((st, i) => { const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2; const x = 280 + Math.cos(a) * 136, y = 185 + Math.sin(a) * 136; const a2 = ((i + 0.5) / steps.length) * Math.PI * 2 - Math.PI / 2;
            return <g key={i}>
              <path d={`M ${280 + Math.cos(a + 0.27) * 136} ${185 + Math.sin(a + 0.27) * 136} A 136 136 0 0 1 ${280 + Math.cos(a2 + 0.33) * 136} ${185 + Math.sin(a2 + 0.33) * 136}`} fill="none" stroke="#1B1A17" strokeWidth="1.1" markerEnd="url(#arr)" />
              <circle cx={x} cy={y} r="33" fill="#FAF8F2" stroke="#1B1A17" strokeWidth="1.2" />
              <circle cx={x} cy={y} r="28" fill="none" stroke={st.c} strokeWidth="1" strokeOpacity=".5" />
              <text x={x} y={y + 6} textAnchor="middle" fill={st.c} fontSize="17" fontWeight="700" fontFamily="'Noto Serif SC', serif">{st.k}</text>
              <text x={x} y={y - 40} textAnchor="middle" fill="#7A7466" fontSize="10" fontFamily="'IBM Plex Mono', monospace">0{i + 1}</text>
            </g>; })}
        </svg>
        <figcaption className="mt-2 text-center text-[12px] text-ink3"><span className="font-serif text-ink">{L('图 1', 'Fig. 1')}</span> · {L('每个后代都要走完这五步', 'every offspring passes all five steps')}</figcaption>
      </figure>
    </section>
    <section className="grid border-l border-t border-ink md:grid-cols-5">{steps.map((st, i) => <div key={i} className="border-b border-r border-ink p-5"><div className="flex items-baseline justify-between"><span className="font-mono text-[11px] text-ink3">0{i + 1}</span><span className="inline-block h-2.5 w-2.5 rounded-full" style={{background: st.c}} /></div><div className="mt-3 font-serif text-[22px] font-bold">{st.k}</div><p className="mt-2 text-[13px] leading-6 text-ink2">{st.d}</p></div>)}</section>
    <section className="grid gap-14 lg:grid-cols-2">
      <div>
        <H2 n="§ 1">{L('适应度', 'Fitness')}</H2>
        <div className="py-4 text-center font-display text-[30px] leading-snug md:text-[34px]"><i>F</i> = 0.35·{v(L('盲评', 'R'))} + 0.30·{v(L('社会', 'S'))} + 0.15·{v(L('进度', 'P'))} + 0.20·{v(L('新颖', 'N'))}</div>
        <dl className="divide-y divide-rule border-y border-rule text-[14px] leading-7">
          {[[L('盲评', 'Review'), L('与亲本两次换序盲评中后代的得票，除以 2；评审只看匿名轨迹和截图。', 'Child votes / 2 across reversed blind comparisons; anonymous trajectories and frames only.')],
            [L('社会', 'Society'), L('0.3·触达 + 0.25·尝试率 + 0.3·留存 + 0.15·口碑，来自 40 人关注图上的确定性扩散。', '0.3·reach + 0.25·try + 0.3·retention + 0.15·sentiment, from deterministic diffusion over 40 personas.')],
            [L('进度', 'Progress'), L('游戏 observe() 报告的最远进度或胜利，不采信模型自报。', 'Furthest progress or win from the game bridge, never model claims.')],
            [L('新颖', 'Novelty'), L('档案库里同类基因越少、改动越实质，分越高。', 'Rarer genes and substantive edits score higher.')]].map(([k, v]) =>
            <div key={k} className="grid grid-cols-[64px_1fr] gap-3 py-3"><dt className="font-serif font-semibold">{k}</dt><dd className="text-ink2">{v}</dd></div>)}
        </dl>
      </div>
      <div>
        <H2 n="§ 2">{L('进化曲线', 'Evolution curve')} {run && <span className="ml-2 font-mono text-[11px] font-normal text-ink3">{run.id.slice(0, 8)}</span>}</H2>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={40} x2={W - 20} y1={py(v)} y2={py(v)} stroke="#1B1A17" strokeOpacity={v === 0 ? 0.8 : 0.1} /><text x={32} y={py(v) + 4} textAnchor="end" fontSize="10" fill="#7A7466" fontFamily="'IBM Plex Mono', monospace">{v}</text></g>)}
          {series.length > 1 && <polyline fill="none" stroke="#A86F1A" strokeDasharray="4 4" strokeWidth="1.4" points={series.map(p => `${px(p.g)},${py(p.mean)}`).join(' ')} />}
          {series.length > 1 && <polyline fill="none" stroke="#B8401F" strokeWidth="2.2" strokeLinejoin="round" points={series.map(p => `${px(p.g)},${py(p.best)}`).join(' ')} />}
          {series.map(p => <g key={p.g}><circle cx={px(p.g)} cy={py(p.best)} r={4} fill="#F2EEE4" stroke="#B8401F" strokeWidth="1.6" /><text x={px(p.g)} y={py(p.best) - 10} textAnchor="middle" fontSize="10" fill="#1B1A17" fontFamily="'IBM Plex Mono', monospace">{fmt(p.best)}</text><text x={px(p.g)} y={H - 10} textAnchor="middle" fontSize="10" fill="#7A7466" fontFamily="'IBM Plex Mono', monospace">G{p.g} · {p.born}{p.dead ? ` / ${p.dead}✕` : ''}</text></g>)}
        </svg>
        <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-ink2"><span className="flex items-center gap-2"><span className="inline-block h-[2px] w-5 bg-vermilion" />{L('历代最佳 F', 'Best F so far')}</span><span className="flex items-center gap-2"><span className="inline-block w-5 border-t border-dashed border-ochre" />{L('当代平均 F', 'Mean F of generation')}</span><span>✕ {L('夭折 / 崩溃', 'stillborn / crashed')}</span></div>
      </div>
    </section>
    <section className="grid gap-14 lg:grid-cols-2">
      <div>
        <H2 n="§ 3">{L('真人校准', 'Human calibration')}</H2>
        <div className="font-display text-[64px] leading-none">{rho === null ? <span className="font-serif text-[36px] font-bold">{L('样本不足', 'Insufficient')}</span> : <>ρ = {fmt(rho)}</>}</div>
        <p className="mt-4 text-[14px] leading-7 text-ink2">{L(`模拟社会分 S 与真人「自然选择它」次数的 Spearman 相关。当前 ${pairs.length} 个物种、${liked} 个被真人选择过；至少需要 5 个物种、其中 3 个被选择过才计算，避免把小样本包装成结论。`, `Spearman correlation between simulated society S and human picks. ${pairs.length} species, ${liked} picked; computed only with ≥5 species and ≥3 picked.`)}</p>
      </div>
      <div>
        <H2 n="§ 4">{L('诚实边界', 'Honest limits')}</H2>
        <ol className="divide-y divide-rule border-b border-rule text-[14px] leading-7 text-ink2">
          {[L('模型盲评与模拟社会都是代理指标，不等于真人觉得好玩；没有开展真人实验。', 'Model reviews and the simulated society are proxies, not human enjoyment; no human study was run.'),
            L('每局最多 24 个按键动作，策略按物种重新学习，路线不保证一致，不是严格的控制变量实验。', 'At most 24 actions per episode; policies are re-learned per species, so this is not a controlled experiment.'),
            L('进化只复用冻结素材，不新增图片；所有版本、证据与导出字节由 SHA-256 绑定。', 'Evolution reuses frozen assets only; versions, evidence and exports are SHA-256 bound.')].map((x, i) =>
            <li key={i} className="grid grid-cols-[28px_1fr] gap-2 py-3"><span className="font-mono text-[11px] leading-7 text-ink3">0{i + 1}</span><span>{x}</span></li>)}
          <li className="grid grid-cols-[28px_1fr] gap-2 py-3"><span className="font-mono text-[11px] leading-7 text-ink3">04</span><span>{L('运行时：', 'Runtime: ')}<span className="font-mono text-[12px] text-ink">{run?.runtime?.mode || '—'}</span>{run?.runtime?.mode === 'local-chromium-sandbox' ? L('（本机 Chromium 沙箱 + 网络白名单，弱于 Docker 容器）', ' (local Chromium sandbox + network allowlist, weaker than Docker)') : ''}</span></li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">{['mechanic', 'level', 'pacing', 'feedback', 'difficulty', 'onboarding', 'visual'].map(g => <span key={g} className="flex items-center gap-1.5 text-[12px] text-ink2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{background: geneOf(g).color}} />{zh ? geneOf(g).zh : geneOf(g).en}</span>)}</div>
      </div>
    </section>
  </div>;
}
