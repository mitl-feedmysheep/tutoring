import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth/session";
import { listMaterials, materialAccessBoard } from "@/lib/files/materials";
import { MATERIAL_MAX_BYTES, sizeText } from "@/lib/files/rules";
import { paidDateText } from "@/lib/payments/payments";
import { formatKst } from "@/lib/time";
import { FilesBoard } from "./files-board";
import { UploadButton } from "./upload-button";

export const metadata: Metadata = { title: "자료실" };

// 자료실 (FILE-01, 03, 05). PDF를 제목·설명과 함께 올리고, 자료를 눌러 오른쪽 창에서 공유할 학생을 고른다.
// open: 그 자료 창을 열어 둔 채로 보여 준다 (예전 자료 화면 주소에서 넘어올 때)
export default async function FilesPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { db } = await requireTeacher();
  const [files, board] = await Promise.all([listMaterials(db), materialAccessBoard(db)]);
  const { open } = await searchParams;

  const shared: Record<string, Record<string, string>> = {};
  for (const [fileId, byStudent] of Object.entries(board.shared)) {
    shared[fileId] = Object.fromEntries(Object.entries(byStudent).map(([studentId, at]) => [studentId, paidDateText(at)]));
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">자료실</h1>
        <UploadButton />
      </div>
      <p className="text-sm text-muted-foreground">
        PDF는 {sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요. 올린 자료는 처음엔 아무에게도 보이지 않아요. 자료를 눌러 공유할 학생을 골라 주세요.
      </p>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 올린 자료가 없어요.</p>
      ) : (
        <FilesBoard
          files={files.map((f) => ({
            id: f.id,
            fileName: f.fileName,
            description: f.description,
            size: sizeText(f.sizeBytes),
            createdText: formatKst(f.createdAt),
            meta: `${sizeText(f.sizeBytes)} · ${formatKst(f.createdAt)} 올림`,
            shared: f.shared,
          }))}
          students={board.students}
          shared={shared}
          initialOpen={files.some((f) => f.id === open) ? open! : null}
        />
      )}
    </div>
  );
}
