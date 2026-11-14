"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MaterialPanel, type PanelFile, type PanelStudent } from "./material-panel";

export type BoardFile = PanelFile & { size: string; createdText: string; shared: number };

// 자료 목록. 줄을 누르면 오른쪽에 그 자료 창(공유할 학생, 제목·설명)이 열린다
export function FilesBoard({ files, students, shared, initialOpen }: { files: BoardFile[]; students: PanelStudent[]; shared: Record<string, Record<string, string>>; initialOpen: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const open = files.find((f) => f.id === openId) ?? null;

  return (
    <>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead className="hidden md:table-cell">크기</TableHead>
              <TableHead className="hidden md:table-cell">올린 날</TableHead>
              <TableHead className="w-24 text-right">공유</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f.id} onClick={() => setOpenId(f.id)} className={f.id === openId ? "cursor-pointer bg-emerald-50/60" : "cursor-pointer"}>
                <TableCell className="max-w-0">
                  <button type="button" className="block w-full truncate text-left font-medium text-emerald-700 hover:underline">
                    {f.fileName}
                  </button>
                  {f.description && <p className="truncate text-xs text-muted-foreground">{f.description}</p>}
                </TableCell>
                <TableCell className="hidden w-24 text-muted-foreground tabular-nums md:table-cell">{f.size}</TableCell>
                <TableCell className="hidden w-44 text-muted-foreground tabular-nums md:table-cell">{f.createdText}</TableCell>
                <TableCell className={f.shared ? "text-right tabular-nums" : "text-right text-muted-foreground"}>{f.shared ? `${f.shared}명` : "비공개"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader className="border-b pr-10">
                <SheetTitle className="break-all">{open.fileName}</SheetTitle>
                <SheetDescription className="tabular-nums">{open.meta}</SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <MaterialPanel file={open} students={students} shared={shared[open.id] ?? {}} onDeleted={() => setOpenId(null)} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
