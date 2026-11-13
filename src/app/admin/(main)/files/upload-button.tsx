"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepareMaterialUploadAction, saveMaterialAction } from "@/app/admin/file-actions";
import { MATERIAL_MAX_BYTES, PDF_TYPE, sizeText } from "@/lib/files/rules";

// PDF 올리기 (FILE-01). 여러 개를 골라도 하나씩 올린다: 서명 URL 받기 → R2에 바로 올리기 → 저장
export function UploadButton() {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadOne(file: File) {
    if (file.type !== PDF_TYPE && !/\.pdf$/i.test(file.name)) throw new Error(`${file.name}: PDF만 올릴 수 있어요`);
    if (file.size > MATERIAL_MAX_BYTES) throw new Error(`${file.name}: PDF는 ${sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요`);
    const prep = await prepareMaterialUploadAction(file.size);
    if (!prep.ok) throw new Error(`${file.name}: ${prep.error}`);
    const put = await fetch(prep.url, { method: "PUT", body: file, headers: { "Content-Type": PDF_TYPE } }).catch(() => null);
    if (!put?.ok) throw new Error(`${file.name}: 올리지 못했어요. 다시 해 주세요`);
    const saved = await saveMaterialAction(prep.token, file.name);
    if (!saved.ok) throw new Error(`${file.name}: ${saved.error}`);
  }

  async function upload(files: File[]) {
    let done = 0;
    for (const [i, file] of files.entries()) {
      setProgress(files.length > 1 ? `올리는 중 (${i + 1}/${files.length})` : "올리는 중...");
      try {
        await uploadOne(file);
        done++;
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setProgress(null);
    if (done) toast.success(`PDF ${done}개를 올렸어요. 공개할 학생을 골라 주세요`);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (files.length) void upload(files);
        }}
      />
      <Button type="button" disabled={progress !== null} onClick={() => input.current?.click()}>
        <Upload />
        {progress ?? "PDF 올리기"}
      </Button>
    </>
  );
}
