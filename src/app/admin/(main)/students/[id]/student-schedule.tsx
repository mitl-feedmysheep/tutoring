"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormError } from "@/components/auth/auth-card";
import { teacherBookAction, teacherCancelAction, teacherMoveAction, teacherWeeklyAction, type ActionResult } from "@/app/admin/student-schedule-actions";

type Weekly = { id: string; label: string; note: string | null };
type Choice = {
  id: string;
  label: string;
  mine: boolean;
  closed: boolean;
  note: string | null;
};
type Lesson = {
  id: string;
  slotId: string;
  label: string;
  fixed: boolean;
  started: boolean;
};
type Slot = { id: string; label: string; participants: number; mine: boolean };
export type HistoryRow = {
  id: string;
  at: string;
  by: string;
  what: string;
  detail: string;
  reason: string | null;
};

type Props = {
  studentId: string;
  studentName: string;
  weekly: Weekly[];
  choices: Choice[];
  lessons: Lesson[];
  slots: Slot[];
  history: HistoryRow[];
  /** 앞으로의 수업과 변경 이력 사이에 넣을 것 (수업 이력) */
  children?: ReactNode;
};

type Open = { kind: "weekly" } | { kind: "add" } | { kind: "move"; lesson: Lesson } | { kind: "cancel"; lesson: Lesson } | null;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const section = "grid gap-3 rounded-lg border bg-background p-4";

// 학생 카드의 일정 부분. 선생님이 바꿀 때는 사유가 필수이고 변경 이력에 남는다 (SCH-16, SCH-17)
export function StudentSchedule({ studentId, studentName, weekly, choices, lessons, slots, history, children }: Props) {
  const [open, setOpen] = useState<Open>(null);

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className={section}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">고정 일정</h3>
          <Button variant="outline" size="sm" onClick={() => setOpen({ kind: "weekly" })} disabled={choices.length === 0}>
            바꾸기
          </Button>
        </div>
        {weekly.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {choices.length === 0 ? "고정 수업 시간을 먼저 등록해 주세요 (일정 → 고정 수업 시간)." : "고정 일정이 없어요."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {weekly.map((w) => (
              <li key={w.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-950 tabular-nums">
                {w.label}
                {w.note && <span className="ml-2 text-amber-700">{w.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">앞으로의 수업</h3>
          <Button variant="outline" size="sm" onClick={() => setOpen({ kind: "add" })}>
            + 수업 추가
          </Button>
        </div>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">앞으로 잡힌 수업이 없어요.</p>
        ) : (
          <ul className="grid divide-y">
            {lessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums">{l.label}</span>
                  <Badge variant="outline" className={l.fixed ? "border-emerald-200 text-emerald-800" : "border-amber-200 text-amber-800"}>
                    {l.fixed ? "고정" : "예약"}
                  </Badge>
                </div>
                {l.started ? (
                  <span className="text-sm text-muted-foreground">진행 중</span>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setOpen({ kind: "move", lesson: l })}>
                      옮기기
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setOpen({ kind: "cancel", lesson: l })}
                    >
                      취소
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {children}

      <section className={section}>
        <h3 className="font-medium">일정 변경 이력</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 바뀐 일정이 없어요.</p>
        ) : (
          <>
            {/* 폰: 목록 */}
            <ul className="grid divide-y md:hidden">
              {history.map((h) => (
                <li key={h.id} className="grid gap-0.5 py-2 text-sm">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {h.at} · {h.by}
                  </p>
                  <p>
                    <span className="font-medium">{h.what}</span> <span className="tabular-nums">{h.detail}</span>
                  </p>
                  {h.reason && <p className="text-muted-foreground">사유: {h.reason}</p>}
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>언제</TableHead>
                  <TableHead>누가</TableHead>
                  <TableHead>무엇</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead>사유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{h.at}</TableCell>
                    <TableCell>{h.by}</TableCell>
                    <TableCell>{h.what}</TableCell>
                    <TableCell className="tabular-nums">{h.detail}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{h.reason ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {open && (
            <ChangeForm
              key={open.kind + ("lesson" in open ? open.lesson.id : "")}
              open={open}
              {...{ studentId, studentName, choices, slots }}
              onDone={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChangeForm({
  open,
  studentId,
  studentName,
  choices,
  slots,
  onDone,
}: {
  open: NonNullable<Open>;
  studentId: string;
  studentName: string;
  choices: Choice[];
  slots: Slot[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState(() => new Set(choices.filter((c) => c.mine).map((c) => c.id)));
  const free = slots.filter((s) => !s.mine);

  const title = {
    weekly: `${studentName} 고정 일정 바꾸기`,
    add: `${studentName} 수업 추가`,
    move: `${studentName} 수업 옮기기`,
    cancel: `${studentName} 수업 취소`,
  }[open.kind];

  function submit(form: FormData) {
    const reason = String(form.get("reason") ?? "");
    const slotId = String(form.get("slot") ?? "");
    start(async () => {
      let res: ActionResult;
      if (open.kind === "weekly") res = await teacherWeeklyAction(studentId, [...picked], reason);
      else if (open.kind === "add") res = await teacherBookAction(studentId, slotId, reason);
      else if (open.kind === "move") res = await teacherMoveAction(studentId, open.lesson.id, slotId, reason);
      else res = await teacherCancelAction(studentId, open.lesson.id, reason);
      if (!res.ok) return setError(res.error);
      toast.success(
        {
          weekly: "고정 일정을 바꿨어요",
          add: "수업을 추가했어요",
          move: "수업을 옮겼어요",
          cancel: "수업을 취소했어요",
        }[open.kind],
      );
      onDone();
    });
  }

  return (
    <form
      className="grid gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid gap-1">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>
          {open.kind === "weekly"
            ? "이미 만들어진 앞으로의 수업도 바로 바뀌어요. 이번 한 번만 바꾸려면 앞으로의 수업에서 옮기기를 쓰세요."
            : open.kind === "move" || open.kind === "cancel"
              ? open.lesson.label + (open.lesson.fixed ? " (고정 수업, 이번 한 번만 바뀌어요)" : "")
              : "앞으로의 수업 시간 중에서 골라요."}
        </SheetDescription>
      </div>

      {open.kind === "weekly" && (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">고정 수업 시간</legend>
          {choices.map((c) => {
            const checked = picked.has(c.id);
            return (
              <label key={c.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-emerald-600"
                  checked={checked}
                  // 닫은 시간은 빼기만 된다 (SCH-15)
                  disabled={c.closed && !checked}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <span className="grid">
                  <span className="tabular-nums">{c.label}</span>
                  {c.note && <span className="text-xs text-amber-700">{c.note}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {(open.kind === "add" || open.kind === "move") &&
        (free.length === 0 ? (
          <p className="text-sm text-muted-foreground">고를 수 있는 앞으로의 수업 시간이 없어요. 일정에서 슬롯을 먼저 열어 주세요.</p>
        ) : (
          <label className="grid gap-1.5 text-sm font-medium">
            {open.kind === "move" ? "옮길 시간" : "수업 시간"}
            <select name="slot" required className={selectClass} defaultValue="">
              <option value="" disabled>
                골라 주세요
              </option>
              {free.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.participants > 0 ? ` · ${s.participants}명` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}

      <label className="grid gap-1.5 text-sm font-medium">
        바꾸는 이유
        <Input name="reason" required maxLength={200} placeholder="예: 선생님 개인 사정으로 하루 옮겨요" />
        <span className="text-xs font-normal text-muted-foreground">일정 변경 이력에 남아요.</span>
      </label>

      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} variant={open.kind === "cancel" ? "destructive" : "default"}>
          {pending ? "저장하는 중..." : open.kind === "cancel" ? "수업 취소" : "저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          닫기
        </Button>
      </div>
    </form>
  );
}
