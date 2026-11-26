'use client';
import {useCallback, useEffect, useRef, useState} from 'react';

/** Pop inks. Every swatch is drawn with a jet keyline, so it reads on white panels and on the black stage alike. */
export const GENE: Record<string, {zh: string; en: string; color: string; glyph: string}> = {
  origin: {zh: '起源', en: 'Origin', color: '#FFFFFF', glyph: '0'},
  repair: {zh: '修复', en: 'Repair', color: '#9A9AA2', glyph: '+'},
  mechanic: {zh: '机制', en: 'Mechanic', color: '#FF2D55', glyph: 'M'},
  level: {zh: '关卡', en: 'Level', color: '#FFB000', glyph: 'L'},
  pacing: {zh: '节奏', en: 'Pacing', color: '#B4F000', glyph: 'P'},
  feedback: {zh: '反馈', en: 'Feedback', color: '#00D9A0', glyph: 'F'},
  difficulty: {zh: '难度', en: 'Difficulty', color: '#FF4FD8', glyph: 'D'},
  onboarding: {zh: '引导', en: 'Onboarding', color: '#2E9BFF', glyph: 'G'},
  visual: {zh: '视觉', en: 'Visual', color: '#9B6BFF', glyph: 'V'},
};
export const geneOf = (g?: string) => GENE[g || 'origin'] || GENE.mechanic;

export type Species = {
  id: string; gen: number; parent: string | null; gene: string; status: 'embryo' | 'alive' | 'stillborn' | 'invalid';
  name: string; latin: string; hypothesis?: string; changes?: string[]; acceptance?: string[]; summary?: string; error?: string;
  elite?: boolean; promoted?: boolean; root?: boolean; cell?: [number, number]; evidence?: string; source?: string; sourceHash?: string;
  metrics: {progress: number; challenge: number; won: number; lost: number; episodes: number};
  fitness?: {F: number; critic?: number; review: number; social: number; progress: number; novelty: number};
  critic?: Critic;
  team?: {index: number; status?: string; minutes?: number; toolCalls?: number; tools?: Record<string, number>; playtests?: number; imagesViewed?: number; timedOut?: boolean; gate?: string; report?: string; log?: string};
  submission?: {answered: string[]}; diffLines?: number;
  reviews?: {order: string; winner: string; reason: string; evidence: string[]}[];
  society?: {S: number; summary: string; posts: Post[]; metrics: Record<string, number>; timeline: number[][]};
  play?: {valid: boolean; errors: string[]; episodes: {seed: number; purpose: string; steps: number; final: any}[]; video?: string};
  frames?: string[]; diffChars?: number; createdAt?: number;
};
export type Critic = {scores: Record<string, number>; C: number; caps: string[]; resembles: string; derivative: boolean; verdict: string; strengths: string[];
  issues: {severity: string; area: string; problem: string; evidence: string; fix: string}[];
  measured?: {motion?: {frames: number; distinct: number; frozen: boolean}; primitiveShare?: number; placeholderArt?: boolean; feel?: Record<string, boolean>}; error?: string};
export const AREA: Record<string, [string, string]> = {novelty: ['新意', 'Novelty'], visual: ['画面', 'Visual'], feel: ['手感', 'Feel'], feedback: ['反馈', 'Feedback'], clarity: ['清晰', 'Clarity'], depth: ['深度', 'Depth'], stability: ['稳定', 'Stability']};
export type Post = {persona: string; name: string; arch: string; archLabel: string; tried: boolean; rating: number; stay: boolean; quit_reason: string | null; text: string; day: number};
export type Run = {
  id: string; gameId: string; status: string; phase: string; createdAt: string; kind: string; error?: string | null; focus?: string; round?: number;
  budgets: Record<string, number>; calls: any[]; versions: Record<string, string>; evidence: string[]; outcome?: string; retainedSpecies?: string;
  runtime?: Record<string, string>; goal: string; model: string;
  evolution?: {generation: number; generations: number; children: number; species: Species[]; archive: Record<string, string>; champion: string | null; weights: Record<string, number>};
};
export type Persona = {id: string; arch: string; archLabel: string; name: string; bio: string; style: string; follows: string[]};
export type EvolutionData = {runs: Run[]; likes: Record<string, number>; personas: {archetypes: Record<string, string>; people: Persona[]}};

export const ACTIVE = ['queued', 'running', 'stopping'];
export async function api(url: string, body?: unknown) {
  const res = await fetch(url, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  const data = await res.json().catch(() => ({ok: false, error: res.statusText}));
  if (!res.ok || data.ok === false) throw Error(data.error || 'Request failed');
  return data;
}

export function useEvolution(gameId: string | null) {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<any>(null);
  const load = useCallback(async () => {
    if (!gameId) { setData(null); return; }
    try { const d = await api(`/api/evolve/${gameId}`); setData(d); setError(''); }
    catch (e) { setError(String(e)); }
  }, [gameId]);
  useEffect(() => { setData(null); load(); }, [load]);
  const active = !!data?.runs.some(r => ACTIVE.includes(r.status));
  useEffect(() => {
    clearInterval(timer.current);
    if (active) timer.current = setInterval(load, 2500);
    return () => clearInterval(timer.current);
  }, [active, load]);
  return {data, error, reload: load, active};
}

export const fmt = (v?: number, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');
export const pct = (v?: number) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) + '%' : '—');
export function useL(locale: string) { return (zh: string, en: string) => (locale === 'zh' ? zh : en); }
export const evidenceUrl = (gameId: string, runId: string, file: string) => `/api/evidence/${gameId}/${runId}/${file}`;
export const speciesUrl = (gameId: string, runId: string, sid: string) => `/api/species/${gameId}/${runId}/${sid}/index.html`;

export const PHASE: Record<string, [string, string]> = {
  readiness: ['准备隔离运行时', 'Preparing runtime'], baseline: ['试玩原始游戏', 'Playing the original'], design: ['语义变异 · 设计', 'Semantic mutation'],
  build: ['制作组 fork 修改中', 'Studios forking'], critic: ['严苛评审', 'Harsh critic'], play: ['AI 玩家真实试玩', 'AI players playing'], review: ['A/B · B/A 盲评', 'Blind A/B review'],
  society: ['玩家社会推演', 'Player society'], select: ['自然选择', 'Natural selection'], done: ['进化完成', 'Evolution done'],
};

/** Gene swatch: a small keylined diamond. */
export const SWATCH = 'inline-block h-[11px] w-[11px] shrink-0 rotate-45 border-2 border-jet';
