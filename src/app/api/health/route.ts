// 배포 후 헬스체크용
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
