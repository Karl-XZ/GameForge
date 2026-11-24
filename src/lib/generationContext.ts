import { AsyncLocalStorage } from 'node:async_hooks';
const signals=new AsyncLocalStorage<AbortSignal>();
export const generationSignal=()=>signals.getStore();
export const withGenerationSignal=<T>(signal:AbortSignal,run:()=>Promise<T>)=>signals.run(signal,run);
