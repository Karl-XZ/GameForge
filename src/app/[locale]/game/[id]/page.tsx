import { notFound } from 'next/navigation';
import { loadVersion, snapshotGame } from '@/lib/versions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function GamePage({params,searchParams}:{params:{id:string};searchParams:{version?:string}}) {
  const version=searchParams.version?await loadVersion(params.id,searchParams.version):await snapshotGame(params.id).catch(()=>null);
  if (!version) return notFound();
  if (!version.record.gameHtml && !version.record.scenes) return <p>Game not ready / 游戏尚未生成</p>;
  return <iframe title={`game-${params.id}`} src={`/api/preview/${params.id}/${version.id}/index.html`} sandbox="allow-scripts allow-pointer-lock" style={{width:'100vw',height:'100vh',border:0}}/>;
}
