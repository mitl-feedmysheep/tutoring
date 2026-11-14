import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { materialDetail } from "@/lib/files/materials";
import { sizeText } from "@/lib/files/rules";
import { paidDateText } from "@/lib/payments/payments";
import { formatKst } from "@/lib/time";
import { AccessEditor, DeleteMaterialButton } from "./access-editor";
import { DescriptionEditor } from "./description-editor";

export const metadata: Metadata = { title: "자료" };

// 자료 하나: 열기, 학생에게 보일 설명 (FILE-05), 공개할 학생 고르기 (FILE-03), 지우기
export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireTeacher();
  const detail = await materialDetail(db, id);
  if (!detail) notFound();
  const { file, students } = detail;

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-4">
      <Link href="/admin/files" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        자료실
      </Link>

      <div className="grid gap-1">
        <h1 className="text-xl font-semibold break-all">{file.fileName}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {sizeText(file.sizeBytes)} · {formatKst(file.createdAt)} 올림
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/admin/files/${file.id}/view`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <ExternalLink className="size-4" />
          열기
        </a>
        <DeleteMaterialButton fileId={file.id} name={file.fileName} />
      </div>

      <h2 className="mt-2 font-semibold">학생에게 보일 설명</h2>
      <DescriptionEditor fileId={file.id} saved={file.description ?? ""} />

      <h2 className="mt-2 font-semibold">공개할 학생</h2>
      <AccessEditor fileId={file.id} students={students.map((s) => ({ id: s.id, name: s.name, sharedText: s.sharedAt ? paidDateText(s.sharedAt) : null }))} />
    </div>
  );
}
