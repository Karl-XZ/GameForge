'use client';
import type {ReactNode} from 'react';
import {fmt, geneOf, SWATCH, type Run} from './common';

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
    {k: L('制作', 'Make'), d: L('语义变异算子选一个基因 → 精确文本编辑 → node --check 语法校验', 'Semantic mutation picks one gene → exact text edits → node --check'), c: '#E8132E'},
    {k: L('试玩', 'Play'), d: L('隔离沙箱里三种玩家人设真实按键：萌新 / 速通 / 探索', 'Isolated sandbox, real key input by newbie / speedrunner / explorer'), c: '#00B884'},
    {k: L('评审', 'Review'), d: L('与亲本做 A/B + B/A 双顺序盲评，引用必须是真实证据路径', 'Reversed blind A/B vs parent; citations must exist'), c: '#2E5BFF'},
    {k: L('社会', 'Society'), d: L('10 类玩家人设基于真实轨迹发帖，7 天口碑在关注图上扩散', '10 personas post from real trajectories; 7-day word of mouth'), c: '#F2A900'},
    {k: L('选择', 'Select'), d: L('适应度 + MAP-Elites 生态位 + 锦标赛选亲本，冠军必须赢下双盲评', 'Fitness + MAP-Elites niches + tournament; champion must win both reviews'), c: '#0B0B0D'},
  ];
  const v = (x: string) => <span className={zh ? 'heavy text-[0.7em]' : 'italic'}>{x}</span>;
  const H2 = ({n, children}: {n: string; children: ReactNode}) => <div className="-mx-6 -mt-6 mb-6 flex items-center gap-3 bg-jet px-6 py-3 text-snow"><span className="font-display text-[22px] leading-none text-pop">{n}</span><h3 className="heavy text-[18px]">{children}</h3></div>;
  return <div className="space-y-16 pb-4">
    <section className="grid items-center gap-12 pt-4 lg:grid-cols-12">
      <div className="stagger lg:col-span-6">
        <div className="tag tag-white"><span>{L('方法', 'Method')}</span></div>
        <h2 className="mt-6 text-[40px] leading-[1.18] md:text-[54px]">
          <span className="shout block -skew-x-[6deg]">{L('游戏不是被设计出来的，', 'Games are not designed;')}</span>
          <span className="mt-3 inline-block -skew-x-[6deg] bg-jet px-3 py-1 heavy text-snow shadow-[6px_6px_0_#FFFFFF]">{L('是被试玩和选择出来的。', 'they are played and selected.')}</span>
        </h2>
        <div className="bubble mt-10 max-w-xl border-[3px] border-jet bg-snow px-6 py-5 shadow-hard">
          <p className="text-[15px] leading-[1.9] text-ink2">{L('GameForge 先用一句话生成可玩的游戏；达尔文进化把它当作第 0 代，沿用 GameForge 的「制作 → 试玩 → 评审」流水线繁衍后代：每一代都要在隔离环境里被真实按键试玩、被盲评、被模拟玩家社会讨论，只有赢下证据的个体才能继续繁衍。', 'GameForge turns one sentence into a playable game. Darwin Evolution treats it as generation 0 and breeds offspring through the same make → play → review pipeline: every child is really played in isolation, blindly reviewed and discussed by a simulated player society; only evidence-backed winners reproduce.')}</p>
        </div>
      </div>
      <figure className="lg:col-span-6">
        <svg viewBox="0 0 560 390" className="w-full overflow-visible">
          <defs><marker id="arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#FFFFFF" /></marker></defs>
          <path d="M280 40l20 56 58-14-38 46 50 32-60 6 8 60-38-46-38 46 8-60-60-6 50-32-38-46 58 14z" transform="translate(0 52) scale(1) " fill="#0B0B0D" opacity=".9" />
          <circle cx="280" cy="190" r="140" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="10 8" />
          <text x="280" y="190" textAnchor="middle" fill="#FFFFFF" fontSize="30" fontWeight="900" fontFamily="'Noto Sans SC', sans-serif" transform="skewX(-8) translate(27 0)">{L('一代', 'ONE GEN')}</text>
          <text x="280" y="214" textAnchor="middle" fill="#FFE135" fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">≈ 6 {L('次模型调用 / 后代', 'calls / child')}</text>
          {steps.map((st, i) => { const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2; const x = 280 + Math.cos(a) * 140, y = 190 + Math.sin(a) * 140; const a2 = ((i + 0.5) / steps.length) * Math.PI * 2 - Math.PI / 2;
            return <g key={i}>
              <path d={`M ${280 + Math.cos(a + 0.3) * 140} ${190 + Math.sin(a + 0.3) * 140} A 140 140 0 0 1 ${280 + Math.cos(a2 + 0.36) * 140} ${190 + Math.sin(a2 + 0.36) * 140}`} fill="none" stroke="#FFFFFF" strokeWidth="5" markerEnd="url(#arr)" />
              <g transform={`translate(${x} ${y})`}>
                <rect x={-44} y={-26} width={88} height={52} transform="skewX(-10) translate(5 5)" fill="#0B0B0D" />
                <rect x={-44} y={-26} width={88} height={52} transform="skewX(-10)" fill={i % 2 ? '#FFFFFF' : '#0B0B0D'} stroke="#0B0B0D" strokeWidth="3" />
                <text x={0} y={8} textAnchor="middle" fill={i % 2 ? '#0B0B0D' : '#FFFFFF'} fontSize="20" fontWeight="900" fontFamily="'Noto Sans SC', 'Barlow Condensed', sans-serif">{st.k}</text>
                <rect x={-50} y={-38} width={26} height={18} transform="skewX(-10)" fill={st.c === '#0B0B0D' ? '#FFE135' : st.c} stroke="#0B0B0D" strokeWidth="2.5" />
                <text x={-39} y={-24.5} textAnchor="middle" fill="#0B0B0D" fontSize="12" fontFamily="Anton, sans-serif">0{i + 1}</text>
              </g>
            </g>; })}
        </svg>
        <figcaption className="mt-4 text-center"><span className="tag"><span>{L('每个后代都要走完这五步', 'Every offspring passes all five steps')}</span></span></figcaption>
      </figure>
    </section>
    <section className="stagger grid gap-5 md:grid-cols-5">{steps.map((st, i) => <div key={i} className={`border-[3px] border-jet p-5 shadow-hard transition hover:-translate-y-1 ${i % 2 ? 'bg-jet text-snow md:translate-y-5' : 'bg-snow'}`}><div className="flex items-center justify-between"><span className={`font-display text-[40px] leading-none ${i % 2 ? 'outline-num' : 'outline-num-dark'}`}>0{i + 1}</span><span className="inline-block h-4 w-4 rotate-45 border-[2.5px] border-jet" style={{background: st.c === '#0B0B0D' ? '#FFE135' : st.c, borderColor: i % 2 ? '#fff' : undefined}} /></div><div className="heavy mt-3 text-[24px]">{st.k}</div><p className={`mt-2 text-[13px] leading-6 ${i % 2 ? 'text-snow/70' : 'text-ink2'}`}>{st.d}</p></div>)}</section>
    <section className="grid gap-8 pt-4 lg:grid-cols-2">
      <div className="plate p-6">
        <H2 n="01">{L('适应度', 'Fitness')}</H2>
        <div className="-skew-x-[6deg] border-[3px] border-jet bg-pop px-4 py-5 text-center font-display text-[26px] leading-snug text-snow shadow-hard md:text-[32px]"><div className="skew-x-[6deg]"><i>F</i> = 0.35·{v(L('盲评', 'R'))} + 0.30·{v(L('社会', 'S'))} + 0.15·{v(L('进度', 'P'))} + 0.20·{v(L('新颖', 'N'))}</div></div>
        <dl className="mt-6 space-y-2 text-[14px] leading-7">
          {[[L('盲评', 'Review'), L('与亲本两次换序盲评中后代的得票，除以 2；评审只看匿名轨迹和截图。', 'Child votes / 2 across reversed blind comparisons; anonymous trajectories and frames only.')],
            [L('社会', 'Society'), L('0.3·触达 + 0.25·尝试率 + 0.3·留存 + 0.15·口碑，来自 40 人关注图上的确定性扩散。', '0.3·reach + 0.25·try + 0.3·retention + 0.15·sentiment, from deterministic diffusion over 40 personas.')],
            [L('进度', 'Progress'), L('游戏 observe() 报告的最远进度或胜利，不采信模型自报。', 'Furthest progress or win from the game bridge, never model claims.')],
            [L('新颖', 'Novelty'), L('档案库里同类基因越少、改动越实质，分越高。', 'Rarer genes and substantive edits score higher.')]].map(([k, val]) =>
            <div key={k} className="grid grid-cols-[76px_1fr] items-start gap-3 border-b-2 border-jet/10 pb-2"><dt><span className="tag text-[12px]"><span>{k}</span></span></dt><dd className="text-ink2">{val}</dd></div>)}
        </dl>
      </div>
      <div className="plate p-6">
        <H2 n="02">{L('进化曲线', 'Evolution curve')} {run && <span className="ml-2 font-mono text-[11px] font-normal text-snow/50">{run.id.slice(0, 8)}</span>}</H2>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map(val => <g key={val}><line x1={40} x2={W - 20} y1={py(val)} y2={py(val)} stroke="#0B0B0D" strokeOpacity={val === 0 ? 1 : 0.1} strokeWidth={val === 0 ? 3 : 1} /><text x={32} y={py(val) + 4} textAnchor="end" fontSize="10" fill="#66666C" fontFamily="'JetBrains Mono', monospace">{val}</text></g>)}
          {series.length > 1 && <polyline fill="none" stroke="#0B0B0D" strokeDasharray="5 5" strokeWidth="2" points={series.map(p => `${px(p.g)},${py(p.mean)}`).join(' ')} />}
          {series.length > 1 && <polyline fill="none" stroke="#0B0B0D" strokeWidth="7" strokeLinejoin="miter" transform="translate(3 3)" points={series.map(p => `${px(p.g)},${py(p.best)}`).join(' ')} />}
          {series.length > 1 && <polyline fill="none" stroke="#E8132E" strokeWidth="5" strokeLinejoin="miter" points={series.map(p => `${px(p.g)},${py(p.best)}`).join(' ')} />}
          {series.map(p => <g key={p.g}><rect x={px(p.g) - 6} y={py(p.best) - 6} width={12} height={12} transform={`rotate(45 ${px(p.g)} ${py(p.best)})`} fill="#FFE135" stroke="#0B0B0D" strokeWidth="2.5" /><text x={px(p.g)} y={py(p.best) - 14} textAnchor="middle" fontSize="13" fill="#0B0B0D" fontFamily="Anton, sans-serif">{fmt(p.best)}</text><text x={px(p.g)} y={H - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="#66666C" fontFamily="'JetBrains Mono', monospace">G{p.g} · {p.born}{p.dead ? ` / ${p.dead}✕` : ''}</text></g>)}
        </svg>
        <div className="mt-4 flex flex-wrap gap-5 text-[12px] font-semibold text-ink2"><span className="flex items-center gap-2"><span className="inline-block h-[5px] w-6 bg-pop" />{L('历代最佳 F', 'Best F so far')}</span><span className="flex items-center gap-2"><span className="inline-block w-6 border-t-2 border-dashed border-jet" />{L('当代平均 F', 'Mean F of generation')}</span><span>✕ {L('夭折 / 崩溃', 'stillborn / crashed')}</span></div>
      </div>
    </section>
    <section className="grid gap-8 lg:grid-cols-2">
      <div className="plate-dark halftone-white p-6">
        <div className="-mx-6 -mt-6 mb-6 flex items-center gap-3 bg-pop px-6 py-3 text-snow"><span className="font-display text-[22px] leading-none text-jet">03</span><h3 className="heavy text-[18px]">{L('真人校准', 'Human calibration')}</h3></div>
        <div className="font-display text-[72px] leading-none">{rho === null ? <span className="heavy slant text-[40px]">{L('样本不足', 'Insufficient')}</span> : <>ρ = {fmt(rho)}</>}</div>
        <p className="mt-5 text-[14px] leading-7 text-snow/75">{L(`模拟社会分 S 与真人「自然选择它」次数的 Spearman 相关。当前 ${pairs.length} 个物种、${liked} 个被真人选择过；至少需要 5 个物种、其中 3 个被选择过才计算，避免把小样本包装成结论。`, `Spearman correlation between simulated society S and human picks. ${pairs.length} species, ${liked} picked; computed only with ≥5 species and ≥3 picked.`)}</p>
      </div>
      <div className="plate p-6">
        <H2 n="04">{L('诚实边界', 'Honest limits')}</H2>
        <ol className="space-y-3 text-[14px] leading-7 text-ink2">
          {[L('模型盲评与模拟社会都是代理指标，不等于真人觉得好玩；没有开展真人实验。', 'Model reviews and the simulated society are proxies, not human enjoyment; no human study was run.'),
            L('每局最多 24 个按键动作，策略按物种重新学习，路线不保证一致，不是严格的控制变量实验。', 'At most 24 actions per episode; policies are re-learned per species, so this is not a controlled experiment.'),
            L('进化只复用冻结素材，不新增图片；所有版本、证据与导出字节由 SHA-256 绑定。', 'Evolution reuses frozen assets only; versions, evidence and exports are SHA-256 bound.')].map((x, i) =>
            <li key={i} className="grid grid-cols-[36px_1fr] gap-3"><span className="mt-0.5 flex h-6 w-8 -skew-x-[10deg] items-center justify-center bg-jet font-display text-[13px] text-snow">0{i + 1}</span><span>{x}</span></li>)}
          <li className="grid grid-cols-[36px_1fr] gap-3"><span className="mt-0.5 flex h-6 w-8 -skew-x-[10deg] items-center justify-center bg-pop font-display text-[13px] text-snow">04</span><span>{L('运行时：', 'Runtime: ')}<span className="font-mono text-[12px] font-semibold text-jet">{run?.runtime?.mode || '—'}</span>{run?.runtime?.mode === 'local-chromium-sandbox' ? L('（本机 Chromium 沙箱 + 网络白名单，弱于 Docker 容器）', ' (local Chromium sandbox + network allowlist, weaker than Docker)') : ''}</span></li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-dashed border-jet/20 pt-4">{['mechanic', 'level', 'pacing', 'feedback', 'difficulty', 'onboarding', 'visual'].map(g => <span key={g} className="flex items-center gap-2 text-[12px] font-bold text-ink2"><span className={SWATCH} style={{background: geneOf(g).color}} />{zh ? geneOf(g).zh : geneOf(g).en}</span>)}</div>
      </div>
    </section>
  </div>;
}
