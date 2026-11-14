"use client";

import { useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MaterialPanel, type PanelFile, type PanelStudent } from "./material-panel";

export type BoardFile = PanelFile & { size: string; createdText: string; shared: number };

// 자료 목록 + 오른쪽 학생 리스트 (FILE-04). 자료를 누르면 화면을 덮지 않고 옆 칸에 그 자료의 학생 리스트가 나온다.
// 좁은 화면(태블릿 세로, 폰)에서는 목록 아래에 나온다
export function FilesBoard({ files, students, shared, initialOpen }: { files: BoardFile[]; students: PanelStudent[]; shared: Record<string, Record<string, string>>; initialOpen: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const open = files.find((f) => f.id === openId) ?? null;
  const panel = useRef<HTMLElement>(null);

  const select = (id: string) => {
    setOpenId(id);
    // 좁은 화면에서는 학생 리스트가 목록 아래에 있으니 그쪽으로 내려 준다
    if (window.innerWidth < 1024) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead className="hidden xl:table-cell">크기</TableHead>
              <TableHead className="hidden md:table-cell">올린 날</TableHead>
              <TableHead className="w-20 text-right">공유</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => {
              const active = f.id === openId;
              return (
                <TableRow key={f.id} onClick={() => select(f.id)} aria-selected={active} className={cn("cursor-pointer", active && "bg-emerald-50 hover:bg-emerald-50")}>
                  <TableCell className="max-w-0">
                    <button type="button" className={cn("block w-full truncate text-left font-medium", active ? "text-emerald-800" : "text-emerald-700 hover:underline")}>
                      {f.fileName}
                    </button>
                    {f.description && <p className="truncate text-xs text-muted-foreground">{f.description}</p>}
                  </TableCell>
                  <TableCell className="hidden w-20 text-muted-foreground tabular-nums xl:table-cell">{f.size}</TableCell>
                  <TableCell className="hidden w-40 text-muted-foreground tabular-nums md:table-cell">{f.createdText}</TableCell>
                  <TableCell className={f.shared ? "text-right tabular-nums" : "text-right text-muted-foreground"}>{f.shared ? `${f.shared}명` : "비공개"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <aside ref={panel} className="scroll-mt-16 rounded-lg border bg-background p-4 lg:sticky lg:top-4">
        {open ? (
          <MaterialPanel file={open} students={students} shared={shared[open.id] ?? {}} onClose={() => setOpenId(null)} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            자료를 누르면 여기서
            <br />
            공유할 학생을 골라요.
          </p>
        )}
      </aside>
    </div>
  );
}
