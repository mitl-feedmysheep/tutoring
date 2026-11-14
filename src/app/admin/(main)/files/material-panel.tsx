"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { askConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMaterialAction, setMaterialAccessAction, updateMaterialAction } from "@/app/admin/file-actions";
import { DESCRIPTION_MAX, FILE_NAME_MAX } from "@/lib/files/rules";

export type PanelFile = { id: string; fileName: string; description: string | null; meta: string };
export type PanelStudent = { id: string; name: string };

// 자료실에서 자료를 누르면 오른쪽에 열리는 창 (FILE-03, 05): 열기·지우기, 제목·설명 고치기, 학생 검색해서 공유
export function MaterialPanel({ file, students, shared, onDeleted }: { file: PanelFile; students: PanelStudent[]; shared: Record<string, string>; onDeleted: () => void }) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/admin/files/${file.id}/view`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <ExternalLink className="size-4" />
          PDF 열기
        </a>
        <DeleteMaterialButton fileId={file.id} name={file.fileName} onDeleted={onDeleted} />
      </div>

      <section className="grid gap-2">
        <h3 className="font-semibold">제목과 설명</h3>
        <InfoEditor key={`${file.id}:${file.fileName}:${file.description}`} file={file} />
      </section>

      <section className="grid gap-2">
        <h3 className="font-semibold">공유할 학생</h3>
        <AccessEditor key={`${file.id}:${Object.keys(shared).sort().join(",")}`} fileId={file.id} students={students} shared={shared} />
      </section>
    </div>
  );
}

function InfoEditor({ file }: { file: PanelFile }) {
  const [title, setTitle] = useState(file.fileName);
  const [description, setDescription] = useState(file.description ?? "");
  const [pending, start] = useTransition();
  const changed = title.trim() !== file.fileName || description.trim() !== (file.description ?? "");

  const save = () =>
    start(async () => {
      const res = await updateMaterialAction(file.id, title, description);
      if (!res.ok) return void toast.error(res.error);
      toast.success("제목과 설명을 저장했어요");
    });

  return (
    <div className="grid gap-2">
      <Input value={title} maxLength={FILE_NAME_MAX} onChange={(e) => setTitle(e.target.value)} aria-label="제목" placeholder="제목" />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        rows={4}
        aria-label="학생에게 보일 설명"
        placeholder={"학생에게 같이 보여 줄 설명이나 참고 링크를 적어요\n예: 3과까지 읽고 오세요. 발음 참고 https://..."}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">https:// 주소는 학생 화면에서 눌러서 열 수 있어요.</span>
        <Button type="button" size="sm" disabled={!changed || !title.trim() || pending} onClick={save} className="shrink-0">
          {pending ? "저장하는 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}

// 학생 이름으로 찾고, 체크해서 공유한다. 체크를 빼고 저장하면 공유를 거둔다. "모두 선택"은 지금 보이는(검색된) 학생만
function AccessEditor({ fileId, students, shared }: { fileId: string; students: PanelStudent[]; shared: Record<string, string> }) {
  const saved = useMemo(() => Object.keys(shared), [shared]);
  const [picked, setPicked] = useState(() => new Set(saved));
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const changed = picked.size !== saved.length || saved.some((id) => !picked.has(id));

  const q = query.trim().toLowerCase();
  const shown = q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleShown = () =>
    setPicked((p) => {
      const next = new Set(p);
      for (const s of shown) {
        if (allShown) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await setMaterialAccessAction(fileId, [...picked]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(picked.size ? `${picked.size}명에게 공유했어요` : "모두 공유를 거뒀어요");
    });

  if (students.length === 0) return <p className="text-sm text-muted-foreground">아직 가입한 학생이 없어요.</p>;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생 이름 검색" aria-label="학생 이름 검색" className="pl-9" />
      </div>
      <div className="rounded-lg border bg-background">
        <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={allShown} disabled={shown.length === 0} onChange={toggleShown} />
          {q ? "검색한 학생 모두 선택" : "모두 선택"}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {picked.size}/{students.length}명
          </span>
        </label>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">&quot;{query.trim()}&quot; 학생이 없어요.</p>
        ) : (
          <ul className="max-h-[50dvh] divide-y overflow-y-auto">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                  <input type="checkbox" className="size-4 accent-emerald-600" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.name}에게 공유`} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {shared[s.id] && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shared[s.id]} 공유</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={!changed || pending} onClick={save}>
          {pending ? "저장하는 중..." : "공유 저장"}
        </Button>
      </div>
    </div>
  );
}

function DeleteMaterialButton({ fileId, name, onDeleted }: { fileId: string; name: string; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-red-700 hover:text-red-700"
      disabled={pending}
      onClick={async () => {
        if (!(await askConfirm({ title: `"${name}"을(를) 지울까요?`, description: "공유한 학생에게서도 사라져요.", confirmLabel: "지우기", destructive: true }))) return;
        start(async () => {
          const res = await deleteMaterialAction(fileId);
          if (!res.ok) return void toast.error(res.error);
          toast.success("자료를 지웠어요");
          onDeleted();
        });
      }}
    >
      지우기
    </Button>
  );
}
