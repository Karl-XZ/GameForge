'use client';
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
    {k: L('制作', 'Make'), d: L('语义变异算子选一个基因 → 精确文本编辑 → node --check 语法校验', 'Semantic mutation picks one gene → exact text edits → node --check'), c: '#ff6b9a'},
    {k: L('试玩', 'Play'), d: L('隔离沙箱里三种玩家人设真实按键：萌新 / 速通 / 探索', 'Isolated sandbox, real key input by newbie / speedrunner / explorer'), c: '#5eead4'},
    {k: L('评审', 'Review'), d: L('与亲本做 A/B + B/A 双顺序盲评，引用必须是真实证据路径', 'Reversed blind A/B vs parent; citations must exist'), c: '#7aa2ff'},
    {k: L('社会', 'Society'), d: L('10 类玩家人设基于真实轨迹发帖，7 天口碑在关注图上扩散', '10 personas post from real trajectories; 7-day word of mouth'), c: '#f2b66d'},
    {k: L('选择', 'Select'), d: L('适应度 + MAP-Elites 生态位 + 锦标赛选亲本，冠军必须赢下双盲评', 'Fitness + MAP-Elites niches + tournament; champion must win both reviews'), c: '#c6f26d'},
  ];
  return <div className="fade-up space-y-14">
    <section className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <div className="label-mono">{L('方法', 'Method')}</div>
        <h2 className="mt-2 font-serif text-5xl leading-tight text-white">{L('游戏不是被设计出来的，', 'Games are not designed,')}<br />{L('是被试玩和选择出来的。', 'they are played and selected.')}</h2>
        <p className="mt-5 max-w-xl leading-8 text-text/80">{L('GameForge 先用一句话生成可玩的游戏；达尔文进化把它当作第 0 代，沿用 GameForge 的「制作 → 试玩 → 评审」流水线繁衍后代：每一代都要在隔离环境里被真实按键试玩、被盲评、被模拟玩家社会讨论，只有赢下证据的个体才能继续繁衍。', 'GameForge turns one sentence into a playable game. Darwin Evolution treats it as generation 0 and breeds offspring through the same make → play → review pipeline: every child is really played in isolation, blindly reviewed and discussed by a simulated player society; only evidence-backed winners reproduce.')}</p>
      </div>
      <svg viewBox="0 0 560 360" className="w-full">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8593a6" /></marker></defs>
        <circle cx="280" cy="180" r="128" fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray="3 6" />
        <text x="280" y="172" textAnchor="middle" fill="#e8edf3" fontSize="20" fontFamily="'Noto Serif SC', serif">{L('一代', 'One generation')}</text>
        <text x="280" y="196" textAnchor="middle" fill="#8593a6" fontSize="11" fontFamily="'JetBrains Mono', monospace">≈ 6 {L('次模型调用 / 后代', 'calls / child')}</text>
        {steps.map((s, i) => { const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2; const x = 280 + Math.cos(a) * 128, y = 180 + Math.sin(a) * 128; const a2 = ((i + 0.5) / steps.length) * Math.PI * 2 - Math.PI / 2;
          return <g key={i}>
            <path d={`M ${280 + Math.cos(a + 0.28) * 128} ${180 + Math.sin(a + 0.28) * 128} A 128 128 0 0 1 ${280 + Math.cos(a2 + 0.34) * 128} ${180 + Math.sin(a2 + 0.34) * 128}`} fill="none" stroke="#8593a6" strokeWidth="1" markerEnd="url(#arr)" />
            <circle cx={x} cy={y} r="30" fill="#0c121b" stroke={s.c} strokeWidth="1.6" /><text x={x} y={y + 6} textAnchor="middle" fill={s.c} fontSize="17" fontFamily="'Noto Serif SC', serif">{s.k}</text>
          </g>; })}
      </svg>
    </section>
    <section className="grid gap-4 md:grid-cols-5">{steps.map((s, i) => <div key={i} className="rounded-xl border border-border p-4"><div className="font-mono text-xs" style={{color: s.c}}>0{i + 1}</div><div className="mt-1 font-serif text-xl text-white">{s.k}</div><p className="mt-2 text-sm leading-6 text-muted">{s.d}</p></div>)}</section>
    <section className="grid gap-10 lg:grid-cols-2">
      <div>
        <div className="label-mono mb-3">{L('适应度公式', 'Fitness')}</div>
        <div className="rounded-xl border border-border p-6 font-mono text-lg text-white">F = 0.35·{L('盲评', 'review')} + 0.30·{L('社会', 'society')} + 0.15·{L('进度', 'progress')} + 0.20·{L('新颖', 'novelty')}</div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-muted">
          <li><b className="text-text">{L('盲评', 'Review')}</b> {L('— 与亲本两次换序盲评中后代得票 / 2；评审只看匿名轨迹和截图。', '— child votes / 2 across reversed blind comparisons; anonymous trajectories and frames only.')}</li>
          <li><b className="text-text">{L('社会', 'Society')}</b> {L('— 0.3·触达 + 0.25·尝试率 + 0.3·留存 + 0.15·口碑，来自 40 人关注图上的确定性扩散。', '— 0.3·reach + 0.25·try + 0.3·retention + 0.15·sentiment from deterministic diffusion over 40 personas.')}</li>
          <li><b className="text-text">{L('进度', 'Progress')}</b> {L('— 游戏桥接 observe() 报告的最远进度或胜利，不采信模型自报。', '— furthest progress / win from the game bridge, never model claims.')}</li>
          <li><b className="text-text">{L('新颖', 'Novelty')}</b> {L('— 档案库中同类基因越少、改动越实质，分越高。', '— rarer genes and substantive edits score higher.')}</li>
        </ul>
      </div>
      <div>
        <div className="label-mono mb-3">{L('进化曲线', 'Evolution curve')} {run && `· ${run.id.slice(0, 8)}`}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border">
          {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={40} x2={W - 20} y1={py(v)} y2={py(v)} stroke="rgba(148,163,184,0.1)" /><text x={32} y={py(v) + 4} textAnchor="end" fontSize="10" fill="#8593a6" fontFamily="monospace">{v}</text></g>)}
          {series.length > 1 && <polyline fill="none" stroke="#5eead4" strokeWidth="2.5" points={series.map(p => `${px(p.g)},${py(p.best)}`).join(' ')} />}
          {series.length > 1 && <polyline fill="none" stroke="#f2b66d" strokeDasharray="4 4" strokeWidth="1.5" points={series.map(p => `${px(p.g)},${py(p.mean)}`).join(' ')} />}
          {series.map(p => <g key={p.g}><circle cx={px(p.g)} cy={py(p.best)} r={4} fill="#5eead4" /><text x={px(p.g)} y={H - 10} textAnchor="middle" fontSize="10" fill="#8593a6" fontFamily="monospace">G{p.g} · {p.born}{p.dead ? `/${p.dead}✕` : ''}</text></g>)}
        </svg>
        <div className="mt-2 flex gap-5 text-xs text-muted"><span><span className="text-primary">━</span> {L('历代最佳 F', 'best F so far')}</span><span><span className="text-amber">┅</span> {L('当代平均 F', 'mean F of generation')}</span><span>✕ {L('夭折/崩溃', 'stillborn/crashed')}</span></div>
      </div>
    </section>
    <section className="grid gap-10 lg:grid-cols-2">
      <div>
        <div className="label-mono mb-3">{L('真人校准', 'Human calibration')}</div>
        <div className="rounded-xl border border-border p-6">
          <div className="font-serif text-4xl text-white">{rho === null ? L('样本不足', 'Insufficient') : `ρ = ${fmt(rho)}`}</div>
          <p className="mt-3 text-sm leading-6 text-muted">{L(`模拟社会分 S 与真人「自然选择它」点赞数的 Spearman 相关。当前 ${pairs.length} 个物种、${liked} 个获得点赞；至少需要 5 个物种且 3 个有点赞才计算，避免把小样本包装成结论。`, `Spearman correlation between simulated society S and human likes. ${pairs.length} species, ${liked} liked; computed only with ≥5 species and ≥3 liked.`)}</p>
        </div>
      </div>
      <div>
        <div className="label-mono mb-3">{L('诚实边界', 'Honest limits')}</div>
        <ul className="space-y-2 text-sm leading-6 text-muted">
          <li>• {L('模型盲评与模拟社会都是代理指标，不等于真人觉得好玩；没有开展真人实验。', 'Model reviews and the simulated society are proxies, not human enjoyment; no human study was run.')}</li>
          <li>• {L('每局最多 24 个按键动作，策略按物种重新学习，路线不保证一致，不是严格控制变量实验。', 'At most 24 actions per episode; policies are re-learned per species, so this is not a controlled experiment.')}</li>
          <li>• {L('进化只复用冻结素材，不新增图片；所有版本、证据与导出字节由 SHA-256 绑定。', 'Evolution reuses frozen assets only; versions, evidence and exports are SHA-256 bound.')}</li>
          <li>• {L('运行时：', 'Runtime: ')}<span className="font-mono text-text/80">{run?.runtime?.mode || '—'}</span>{run?.runtime?.mode === 'local-chromium-sandbox' ? L('（本机 Chromium 沙箱 + 网络白名单，弱于 Docker 容器）', ' (local Chromium sandbox + network allowlist, weaker than Docker)') : ''}</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries({mechanic: 1, level: 1, pacing: 1, feedback: 1, difficulty: 1, onboarding: 1, visual: 1}).map(([g]) => <span key={g} className="rounded-full border border-border px-3 py-1 text-xs"><span style={{color: geneOf(g).color}}>●</span> {zh ? geneOf(g).zh : geneOf(g).en}</span>)}</div>
      </div>
    </section>
  </div>;
}
