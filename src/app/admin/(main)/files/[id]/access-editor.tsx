"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMaterialAction, setMaterialAccessAction } from "@/app/admin/file-actions";

type StudentRow = { id: string; name: string; sharedText: string | null };

// 공개할 학생 고르기 (FILE-03). 여러 명을 체크하고 저장한다. 체크를 빼고 저장하면 공개를 거둔다
export function AccessEditor({ fileId, students }: { fileId: string; students: StudentRow[] }) {
  const saved = students.filter((s) => s.sharedText !== null).map((s) => s.id);
  const [picked, setPicked] = useState(() => new Set(saved));
  const [pending, start] = useTransition();
  const changed = picked.size !== saved.length || saved.some((id) => !picked.has(id));
  const all = students.length > 0 && picked.size === students.length;

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await setMaterialAccessAction(fileId, [...picked]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(picked.size ? `${picked.size}명에게 공개했어요` : "모두 비공개로 바꿨어요");
    });

  if (students.length === 0) return <p className="text-sm text-muted-foreground">아직 가입한 학생이 없어요.</p>;

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-background">
        <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={all} onChange={() => setPicked(all ? new Set() : new Set(students.map((s) => s.id)))} />
          모두 선택
          <span className="ml-auto text-muted-foreground tabular-nums">
            {picked.size}/{students.length}명
          </span>
        </label>
        <ul className="divide-y">
          {students.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                <input type="checkbox" className="size-4 accent-emerald-600" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.name}에게 공개`} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.sharedText && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{s.sharedText} 공개</span>}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={!changed || pending} onClick={save}>
          {pending ? "저장하는 중..." : "공개 저장"}
        </Button>
      </div>
    </div>
  );
}

export function DeleteMaterialButton({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-red-700 hover:text-red-700"
      disabled={pending}
      onClick={() => {
        if (!confirm(`"${name}"을(를) 지울까요? 공개한 학생에게서도 사라져요.`)) return;
        start(async () => {
          const res = await deleteMaterialAction(fileId);
          if (!res.ok) return void toast.error(res.error);
          toast.success("자료를 지웠어요");
          router.replace("/admin/files");
        });
      }}
    >
      지우기
    </Button>
  );
}
