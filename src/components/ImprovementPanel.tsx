'use client';
import {useEffect,useState,useCallback} from 'react';

async function api(url:string,body?:unknown) {
  const res=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const data=await res.json();if(!res.ok || !data.ok) throw Error(data.error||'Request failed');return data;
}
export function ImprovementPanel({gameId,locale,onApply}:{gameId:string;locale:string;onApply:()=>void}) {
  const zh=locale==='zh';const text=(cn:string,en:string)=>zh?cn:en;
  const [goal,setGoal]=useState(text('让新玩家更快理解目标，改进操作反馈、难度节奏和失败后的重试体验。','Improve onboarding, input feedback, difficulty pacing and recovery.'));
  const [constraints,setConstraints]=useState(text('保留题材、核心玩法、现有素材与真实挑战，不添加付费素材。','Keep genre, core loop, assets and genuine challenge.'));
  const [rounds,setRounds]=useState(3);const [episodes,setEpisodes]=useState(3);const [calls,setCalls]=useState(30);const [minutes,setMinutes]=useState(30);
  const [run,setRun]=useState<any>(null);const [versions,setVersions]=useState<any[]>([]);const [current,setCurrent]=useState('');const [left,setLeft]=useState('');const [right,setRight]=useState('');
  const [runs,setRuns]=useState<any[]>([]);
  const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [compare,setCompare]=useState(false);
  const refresh=useCallback(async(id?:string)=>{
    const v=await api(`/api/versions/${gameId}`);setVersions(v.versions);setCurrent(v.current);setLeft(x=>x||v.current);setRight(x=>x||v.current);
    setRuns((await api(`/api/improve/${gameId}`)).runs);
    if(id){const r=(await api(`/api/improve/${gameId}/${id}`)).run;setRun(r);setLeft(r.baseVersion);if(r.status==='completed')setRight(r.versions?.[r.retained]||v.current);}
  },[gameId]);
  useEffect(()=>{let live=true;setRun(null);setLeft('');setRight('');setError('');
    (async()=>{try{const data=await api(`/api/improve/${gameId}`);if(live)await refresh(data.runs[0]?.id);}catch(e){if(live)setError(String(e));}})();return()=>{live=false};
  },[gameId,refresh]);
  const runId=run?.id,runStatus=run?.status;
  useEffect(()=>{if(!runId || !['queued','running','stopping'].includes(runStatus))return;
    const timer=setInterval(()=>api(`/api/improve/${gameId}/${runId}`).then(d=>{setRun(d.run);if(d.run.status==='completed')refresh(runId);}).catch(e=>setError(String(e))),2500);return()=>clearInterval(timer);
  },[gameId,runId,runStatus,refresh]);
  async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}}
  const active=run&&['queued','running','stopping'].includes(run.status);
  const style='field';const btn='btn-quiet';
  const versionSelect=(value:string,change:(v:string)=>void)=><select aria-label={text('选择版本','Select version')} className={style+' font-mono text-[12px]'} value={value} onChange={e=>change(e.target.value)}>{versions.map(v=><option value={v.id} key={v.id}>{v.id.slice(0,8)} · {v.label}</option>)}</select>;
  return <section>
    <details className="group">
    <summary className="flex cursor-pointer list-none flex-wrap items-end justify-between gap-4 pb-7">
      <div className="flex items-end gap-4"><span className="outline-num font-display text-[64px] leading-[0.8] md:text-[84px]">03</span><div className="pb-1"><div className="tag mb-2">{text('原版流程','Classic loop')}</div><h2 className="shout slant text-[34px] leading-none md:text-[44px]">{text('单候选改进','Single-candidate improvement')}</h2>
      <p className="mt-3 max-w-2xl bg-jet px-3 py-2 text-[13px] leading-6 text-snow/80">{text('GameForge 的原始改进流程：真实按键试玩、交换顺序盲评、保守保留。模型评价是体验代理指标，不代表真人已验证好玩。','The original GameForge loop: real keyboard play, reversed blind reviews, conservative retention. Model preference is a proxy, not human-validated enjoyment.')}</p></div></div>
      <span className="btn-line shrink-0"><span className="group-open:hidden">{text('展开','Expand')}</span><span className="hidden group-open:inline">{text('收起','Collapse')}</span></span>
    </summary>
    <div className="plate fade-up space-y-5 p-6 md:p-7">
    <div className="grid gap-4 md:grid-cols-2">
    <label className="block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet">{text('改进目标 / 目标玩家','Goal / target players')}<textarea className={style+' mt-2'} rows={3} value={goal} onChange={e=>setGoal(e.target.value)} disabled={active}/></label>
    <label className="block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet">{text('必须保留的约束','Constraints')}<textarea className={style+' mt-2'} rows={3} value={constraints} onChange={e=>setConstraints(e.target.value)} disabled={active}/></label>
    </div>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[[text('轮次','Rounds'),rounds,setRounds,5],[text('每版试玩局数','Episodes/version'),episodes,setEpisodes,3],[text('模型调用上限','Call limit'),calls,setCalls,60],[text('分钟上限','Minutes'),minutes,setMinutes,60]].map(([label,value,set,max]:any)=><label key={label} className="block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet">{label}<input className={style+' mt-2 font-mono'} type="number" min={label===text('模型调用上限','Call limit')?4:1} max={max} value={value} disabled={active} onChange={e=>set(Number(e.target.value))}/></label>)}</div>
    <div className="flex flex-wrap gap-2">
      <button className="btn-ink" disabled={busy||active||!current} onClick={()=>action(async()=>{const r=await api(`/api/improve/${gameId}`,{requestId:crypto.randomUUID(),baseVersion:current,goal,constraints,budgets:{rounds,episodes,calls,minutes}});setRun(r.run);setLeft(current);})}>{text('开始真实试玩改进','Start real improvement')}</button>
      <button className={btn} disabled={busy||active||!current} onClick={()=>action(async()=>{const r=await api(`/api/improve/${gameId}`,{kind:'evaluate',requestId:crypto.randomUUID(),baseVersion:current,goal,constraints,budgets:{rounds:1,episodes,calls,minutes}});setRun(r.run);setLeft(current);})}>{text('仅试玩验证','Validate gameplay only')}</button>
      {active&&<button className={btn} disabled={busy} onClick={()=>action(async()=>{await api(`/api/improve/${gameId}/${run.id}`,{action:'stop'});})}>{text('停止任务','Stop run')}</button>}
      {run&&['stopped','failed'].includes(run.status)&&<button className={btn} disabled={busy} onClick={()=>action(async()=>{await api(`/api/improve/${gameId}/${run.id}`,{action:'resume'});await refresh(run.id);})}>{text('从检查点恢复','Resume checkpoint')}</button>}
      <button className={btn} onClick={()=>setCompare(!compare)}>{text('对比版本','Compare versions')}</button>
      <button className={btn} disabled={busy} onClick={()=>action(()=>refresh(run?.id))}>{text('刷新','Refresh')}</button>
    </div>
    {runs.length>0&&<label className="block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet">{text('历史任务与证据','Run history & evidence')} <select className={style+' mt-2 font-mono text-[12px]'} value={run?.id||''} disabled={busy||active} onChange={e=>action(()=>refresh(e.target.value))}>{run&&<option value={run.id}>{run.id} · {run.status}</option>}{runs.filter(r=>r.id!==run?.id).map(r=><option value={r.id} key={r.id}>{r.id} · {r.status}</option>)}</select></label>}
    {error&&<p role="alert" className="border-l-[5px] border-pop bg-pop/10 px-3 py-2 text-[13px] font-semibold text-pop">{error}</p>}
    {run&&<div role="status" className="space-y-2 border-[2.5px] border-jet bg-bone p-4 text-[13px] leading-6">
      <p className="font-mono text-[12px] text-ink2">{text('状态 / 阶段','Status / phase')}: {run.status} / {run.phase} · {text('当前轮','Round')} {run.round||0} · {text('模型调用','Calls')} {run.calls?.length||0}/{run.budgets.calls} · {text('实际费用：未知','Cost: unknown')}</p>
      {run.error&&<p className="text-vermilion">{run.error}</p>}
      {run.outcome&&<p>{run.outcome==='evaluated'?text('已完成真实试玩验证，查看轨迹和录像。','Gameplay validation finished; inspect the evidence.'):run.outcome==='improved_proxy'?text('模型双盲评审认可改进，等待你试玩并选用。','Both blind reviews prefer the candidate. Play it before applying.'):text('没有得到可验证的改进，保留原版。','No verified improvement; original retained.')}</p>}
      {(run.history||[]).map((r:any)=><details key={r.round}><summary className="cursor-pointer">{text('轮次','Round')} {r.round}: {r.promoted?text('保留候选','Candidate retained'):text('保留旧版','Previous retained')}</summary><p className="text-ink2">{r.plan.hypothesis}</p>{r.reviews.map((v:any,i:number)=><p key={i} className="text-ink3">{i===0?'A/B':'B/A'}: {v.winner} — {v.reason}</p>)}</details>)}
      <details><summary className="cursor-pointer">{text('真实试玩证据','Gameplay evidence')} ({run.evidence?.length||0})</summary><div className="flex flex-wrap gap-3">{(run.evidence||[]).filter((f:string)=>/\.(mp4|webm)$/.test(f)).map((f:string)=><div key={f}><p className="font-mono text-[11px] text-ink3">{f}</p><video controls preload="none" className="max-w-md border border-rule" src={`/api/evidence/${gameId}/${run.id}/${f}`}/></div>)}</div><div className="max-h-64 overflow-auto font-mono text-[11px]">{(run.evidence||[]).filter((f:string)=>f.endsWith('.json')).map((f:string)=><a key={f} className="link block" target="_blank" rel="noreferrer" href={`/api/evidence/${gameId}/${run.id}/${f}`}>{f}</a>)}</div></details>
    </div>}
    {compare&&<div className="grid gap-4 md:grid-cols-2">{[[left,setLeft],[right,setRight]].map(([value,change]:any,i)=><div key={i} className="space-y-2">{versionSelect(value,change)}<iframe title={`compare-${i}`} className="h-96 w-full border border-ink bg-ink" sandbox="allow-scripts allow-pointer-lock" src={`/api/preview/${gameId}/${value}/index.html`}/><a className="link text-[13px]" href={`/api/export/${gameId}?version=${value}`}>{text('下载此版离线 ZIP','Download this version')}</a></div>)}</div>}
    <div className="flex flex-wrap items-center gap-2"><div className="w-72">{versionSelect(right,setRight)}</div><button className="btn-ink" disabled={busy||!right} onClick={()=>action(async()=>{await api(`/api/versions/${gameId}`,{version:right,expectedVersion:current});await refresh(run?.id);onApply();})}>{text('选用此版本（检查编辑冲突）','Apply version (checks conflicts)')}</button></div>
    <label className="block font-cond text-[13px] font-bold uppercase tracking-[0.06em] text-jet">{text('人工试玩反馈（绑定当前版本）','Human feedback (current version)')}<textarea className={style+' mt-2'} rows={2} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button className={btn} disabled={busy||!note.trim()} onClick={()=>action(async()=>{await api(`/api/feedback/${gameId}`,{version:current,note});setNote('');})}>{text('保存反馈，供下轮改进使用','Save feedback for next run')}</button>
    </div>
    </details>
  </section>;
}
