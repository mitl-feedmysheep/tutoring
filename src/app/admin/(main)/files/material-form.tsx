"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prepareMaterialUploadAction, saveMaterialAction, updateMaterialAction } from "@/app/admin/file-actions";
import { DESCRIPTION_MAX, FILE_NAME_MAX, MATERIAL_MAX_BYTES, PDF_TYPE, sizeText } from "@/lib/files/rules";

/** 파일 이름에서 제목 기본값 ("Unit 1.pdf" → "Unit 1") */
const titleOf = (name: string) => name.replace(/\.pdf$/i, "").trim().slice(0, FILE_NAME_MAX);

type Edit = { id: string; fileName: string; description: string | null };

/**
 * 자료 모달 (FILE-01, 04, 05). edit가 없으면 새 자료 올리기: 제목, PDF, 설명을 적고 올린다.
 * edit가 있으면 그 자료의 제목·설명 고치기 (PDF는 바꾸지 않는다)
 */
export function MaterialFormModal({ edit, onClose }: { edit?: Edit; onClose: () => void }) {
  const [title, setTitle] = useState(edit?.fileName ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.type !== PDF_TYPE && !/\.pdf$/i.test(f.name)) return void toast.error("PDF만 올릴 수 있어요");
    if (f.size > MATERIAL_MAX_BYTES) return void toast.error(`PDF는 ${sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요`);
    setFile(f);
    // 제목을 아직 안 적었으면 파일 이름으로 채운다
    if (!title.trim()) setTitle(titleOf(f.name));
  }

  async function submit() {
    setBusy(true);
    try {
      if (edit) {
        const res = await updateMaterialAction(edit.id, title, description);
        if (!res.ok) throw new Error(res.error);
        toast.success("제목과 설명을 저장했어요");
      } else {
        if (!file) return;
        const prep = await prepareMaterialUploadAction(file.size);
        if (!prep.ok) throw new Error(prep.error);
        const put = await fetch(prep.url, { method: "PUT", body: file, headers: { "Content-Type": PDF_TYPE } }).catch(() => null);
        if (!put?.ok) throw new Error("올리지 못했어요. 다시 해 주세요");
        const saved = await saveMaterialAction(prep.token, title, description);
        if (!saved.ok) throw new Error(saved.error);
        toast.success("자료를 올렸어요. 자료를 눌러 공유할 학생을 골라 주세요");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = title.trim() !== "" && (edit !== undefined || file !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-form-title"
        className="grid max-h-[90dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="material-form-title" className="text-lg font-semibold">
            {edit ? "제목과 설명 고치기" : "PDF 올리기"}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X className="size-5" />
          </button>
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          제목
          <Input value={title} maxLength={FILE_NAME_MAX} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="예: Unit 1 듣기" autoFocus />
        </label>

        {!edit && (
          <div className="grid gap-1.5 text-sm font-medium">
            자료
            <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (pick(e.currentTarget.files?.[0]), (e.currentTarget.value = ""))} />
            {file ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 font-normal">
                <FileText className="size-4 shrink-0 text-emerald-700" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{sizeText(file.size)}</span>
                <button type="button" disabled={busy} onClick={() => input.current?.click()} className="shrink-0 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50">
                  바꾸기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex h-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm font-normal text-muted-foreground hover:bg-slate-50"
              >
                <FileText className="size-5" />
                PDF 고르기 ({sizeText(MATERIAL_MAX_BYTES)}까지)
              </button>
            )}
          </div>
        )}

        <label className="grid gap-1.5 text-sm font-medium">
          <span>
            학생에게 보일 설명 <span className="font-normal text-muted-foreground">(선택)</span>
          </span>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"참고 링크나 안내를 적어요\n예: 3과까지 읽고 오세요. 발음 참고 https://..."}
            className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm font-normal leading-relaxed outline-none placeholder:text-muted-foreground focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
          <span className="text-xs font-normal text-muted-foreground">https:// 주소는 학생 화면에서 눌러서 열 수 있어요.</span>
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button type="button" disabled={!ready || busy} onClick={submit}>
            {busy ? (edit ? "저장하는 중..." : "올리는 중...") : edit ? "저장" : "올리기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
