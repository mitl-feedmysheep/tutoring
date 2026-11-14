"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prepareMaterialUploadAction, saveMaterialAction } from "@/app/admin/file-actions";
import { DESCRIPTION_MAX, FILE_NAME_MAX, MATERIAL_MAX_BYTES, PDF_TYPE, sizeText } from "@/lib/files/rules";

type Item = { key: number; file: File; title: string; description: string };
let seq = 0;

/** 파일 이름에서 제목 기본값을 만든다 ("Unit 1.pdf" → "Unit 1") */
const titleOf = (name: string) => name.replace(/\.pdf$/i, "").trim().slice(0, FILE_NAME_MAX);

// PDF 올리기 (FILE-01, 05). PDF를 고르면 창에서 파일마다 제목과 학생에게 보일 설명을 적고 올린다.
// 여러 개면 하나씩: 서명 URL 받기 → R2에 바로 올리기 → 저장
export function UploadButton() {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const busy = progress !== null;

  function pick(files: File[]) {
    const ok: Item[] = [];
    for (const file of files) {
      if (file.type !== PDF_TYPE && !/\.pdf$/i.test(file.name)) toast.error(`${file.name}: PDF만 올릴 수 있어요`);
      else if (file.size > MATERIAL_MAX_BYTES) toast.error(`${file.name}: PDF는 ${sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요`);
      else ok.push({ key: ++seq, file, title: titleOf(file.name), description: "" });
    }
    if (ok.length) {
      setItems((list) => [...list, ...ok]);
      setOpen(true);
    }
  }

  const change = (key: number, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function uploadOne(item: Item) {
    const prep = await prepareMaterialUploadAction(item.file.size);
    if (!prep.ok) throw new Error(prep.error);
    const put = await fetch(prep.url, { method: "PUT", body: item.file, headers: { "Content-Type": PDF_TYPE } }).catch(() => null);
    if (!put?.ok) throw new Error("올리지 못했어요. 다시 해 주세요");
    const saved = await saveMaterialAction(prep.token, item.title, item.description);
    if (!saved.ok) throw new Error(saved.error);
  }

  async function upload() {
    let done = 0;
    for (const [i, item] of items.entries()) {
      setProgress(items.length > 1 ? `올리는 중 (${i + 1}/${items.length})` : "올리는 중...");
      try {
        await uploadOne(item);
        done++;
        // 올린 것은 창에서 뺀다. 실패한 것만 남아 다시 올릴 수 있다
        setItems((list) => list.filter((x) => x.key !== item.key));
      } catch (e) {
        toast.error(`${item.title || item.file.name}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
    if (done) toast.success(`PDF ${done}개를 올렸어요. 자료를 눌러 공유할 학생을 골라 주세요`);
    if (done === items.length) setOpen(false);
  }

  const close = () => {
    if (busy) return;
    setOpen(false);
    setItems([]);
  };

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
          if (files.length) pick(files);
        }}
      />
      <Button type="button" onClick={() => input.current?.click()}>
        <Upload />
        PDF 올리기
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            className="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 id="upload-title" className="text-lg font-semibold">
                PDF 올리기
              </h2>
              <button type="button" onClick={close} disabled={busy} aria-label="닫기" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X className="size-5" />
              </button>
            </div>

            <ul className="grid gap-4 overflow-y-auto px-5 py-4">
              {items.map((item) => (
                <li key={item.key} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.file.name} · {sizeText(item.file.size)}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))}
                      aria-label={`${item.file.name} 빼기`}
                      className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <label className="grid gap-1 text-sm font-medium">
                    제목
                    <Input value={item.title} maxLength={FILE_NAME_MAX} disabled={busy} onChange={(e) => change(item.key, { title: e.target.value })} placeholder="예: Unit 1 듣기" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    <span>
                      학생에게 보일 설명 <span className="font-normal text-muted-foreground">(선택)</span>
                    </span>
                    <textarea
                      value={item.description}
                      maxLength={DESCRIPTION_MAX}
                      rows={3}
                      disabled={busy}
                      onChange={(e) => change(item.key, { description: e.target.value })}
                      placeholder={"참고 링크나 안내를 적어요\n예: 3과까지 읽고 오세요. 발음 참고 https://..."}
                      className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm font-normal leading-relaxed outline-none placeholder:text-muted-foreground focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
              <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
                PDF 더 고르기
              </Button>
              <Button type="button" disabled={busy || items.length === 0 || items.some((i) => !i.title.trim())} onClick={upload}>
                {progress ?? `${items.length}개 올리기`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
