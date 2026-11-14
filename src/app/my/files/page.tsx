import type { Metadata } from "next";
import { Eye, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { listMaterials, myMaterials } from "@/lib/files/materials";
import { fileKindLabel, sizeText } from "@/lib/files/rules";
import { listTimeText } from "@/lib/board/format";
import { SubScreen } from "@/components/app/screens";
import { Card, Empty, Rule } from "@/components/app/ui";
import { LinkifiedText } from "@/components/linkified-text";

export const metadata: Metadata = { title: "자료실" };

type Item = { id: string; fileName: string; contentType: string; sizeBytes: number; description: string | null; meta: string };

// MY > 자료실 (FILE-03, APP-17). 학생은 나에게 공개된 자료, 선생님은 올린 자료 전부.
// 누르면 자료가 새 창(아이폰 홈 화면 앱에서는 앱 안 브라우저)으로 열린다. 저장은 그 화면의 공유·저장 기능으로
export default async function FilesScreen() {
  const { claims } = await requireUser();
  const now = new Date();
  let items: Item[];
  if (claims.role === "student") {
    const rows = await myMaterials(studentDb(claims.teacherId, claims.studentId));
    items = rows.map((r) => ({ ...r, meta: listTimeText(r.sharedAt, now) }));
  } else {
    const rows = await listMaterials(teacherDb(claims.teacherId));
    items = rows.map((r) => ({ ...r, meta: r.shared ? `${r.shared}명 공개` : "비공개" }));
  }

  return (
    <SubScreen title="자료실" fallback="/my">
      {claims.role === "teacher" && <Rule>자료 올리기와 공개할 학생 고르기는 어드민 자료실에서 해요.</Rule>}
      {items.length === 0 ? (
        <Empty>{claims.role === "student" ? "아직 받은 자료가 없어요." : "아직 올린 자료가 없어요."}</Empty>
      ) : (
        items.map((f) => (
          // 자료 하나가 카드 하나. 위는 파일 정보, 가운데 설명, 맨 아래 "열어 보기" 버튼 (높이 48px, 카드 너비 전체)
          <Card key={f.id} className="divide-y-0">
            <a href={`/files/${f.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-4 pt-4 pb-3">
              <span className="flex h-13 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-accent text-primary">
                <FileText className="size-5" />
                <span className="text-[10px] leading-none font-extrabold">{fileKindLabel(f.contentType)}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-all">{f.fileName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sizeText(f.sizeBytes)} · {f.meta}
                </span>
              </span>
            </a>
            {/* FILE-05: 선생님 설명. 링크를 누를 수 있게 PDF 링크 밖에 둔다 */}
            {f.description && (
              <div className="px-4 pb-3">
                <LinkifiedText text={f.description} className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-foreground/80" />
              </div>
            )}
            <div className="px-4 pb-4">
              <a
                href={`/files/${f.id}`}
                target="_blank"
                rel="noopener"
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80"
              >
                <Eye className="size-5" />
                열어 보기
              </a>
            </div>
          </Card>
        ))
      )}
    </SubScreen>
  );
}
