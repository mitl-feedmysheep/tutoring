import type { Metadata } from "next";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/session";
import { listMaterials } from "@/lib/files/materials";
import { MATERIAL_MAX_BYTES, sizeText } from "@/lib/files/rules";
import { formatKst } from "@/lib/time";
import { UploadButton } from "./upload-button";

export const metadata: Metadata = { title: "자료실" };

// 자료실 (FILE-01, 03). PDF를 올리고, 자료를 눌러 공개할 학생을 고른다
export default async function FilesPage() {
  const { db } = await requireTeacher();
  const files = await listMaterials(db);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">자료실</h1>
        <UploadButton />
      </div>
      <p className="text-sm text-muted-foreground">
        PDF는 {sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요. 올린 자료는 처음엔 아무에게도 보이지 않아요. 자료를 눌러 공개할 학생을 골라 주세요.
      </p>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 올린 자료가 없어요.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead className="hidden md:table-cell">크기</TableHead>
                <TableHead className="hidden md:table-cell">올린 날</TableHead>
                <TableHead className="w-24 text-right">공개</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="max-w-0 font-medium">
                    <Link href={`/admin/files/${f.id}`} className="block truncate text-emerald-700 hover:underline">
                      {f.fileName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden w-24 text-muted-foreground tabular-nums md:table-cell">{sizeText(f.sizeBytes)}</TableCell>
                  <TableCell className="hidden w-44 text-muted-foreground tabular-nums md:table-cell">{formatKst(f.createdAt)}</TableCell>
                  <TableCell className={f.shared ? "text-right tabular-nums" : "text-right text-muted-foreground"}>{f.shared ? `${f.shared}명` : "비공개"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
