import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { listMaterials, myMaterials } from "@/lib/files/materials";
import { sizeText } from "@/lib/files/rules";
import { listTimeText } from "@/lib/board/format";
import { SubScreen } from "@/components/app/screens";
import { Card, Empty, Rule } from "@/components/app/ui";

export const metadata: Metadata = { title: "자료실" };

type Item = { id: string; fileName: string; sizeBytes: number; note: string };

// MY > 자료실 (FILE-03, APP-17). 학생은 나에게 공개된 자료, 선생님은 올린 자료 전부.
// 누르면 PDF가 새 창(아이폰 홈 화면 앱에서는 앱 안 브라우저)으로 열린다. 저장은 그 화면의 공유·저장 기능으로
export default async function FilesScreen() {
  const { claims } = await requireUser();
  const now = new Date();
  let items: Item[];
  if (claims.role === "student") {
    const rows = await myMaterials(studentDb(claims.teacherId, claims.studentId));
    items = rows.map((r) => ({ ...r, note: listTimeText(r.sharedAt, now) }));
  } else {
    const rows = await listMaterials(teacherDb(claims.teacherId));
    items = rows.map((r) => ({ ...r, note: r.shared ? `${r.shared}명 공개` : "비공개" }));
  }

  return (
    <SubScreen title="자료실" fallback="/my">
      {claims.role === "teacher" && <Rule>자료 올리기와 공개할 학생 고르기는 어드민 자료실에서 해요.</Rule>}
      {items.length === 0 ? (
        <Empty>{claims.role === "student" ? "아직 받은 자료가 없어요." : "아직 올린 자료가 없어요."}</Empty>
      ) : (
        <Card>
          {items.map((f) => (
            <a key={f.id} href={`/files/${f.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <FileText className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">{f.fileName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sizeText(f.sizeBytes)} · {f.note}
                </span>
              </span>
            </a>
          ))}
        </Card>
      )}
    </SubScreen>
  );
}
