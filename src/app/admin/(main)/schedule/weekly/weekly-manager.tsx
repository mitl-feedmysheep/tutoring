"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/auth/auth-card";
import { WEEKDAYS, formatMinute } from "@/lib/schedule/kst";
import type { WeeklyChangeResult } from "@/lib/schedule/teacher";
import { createWeeklySlotAction, deleteWeeklySlotAction, updateWeeklySlotAction } from "@/app/admin/schedule-actions";

type Weekly = { id: string; weekday: number; startMinute: number; endMinute: number; students: string[] };

/** 월요일부터 */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const sortKey = (w: Weekly) => ((w.weekday + 6) % 7) * 10000 + w.startMinute;

function resultMessage(r: WeeklyChangeResult, done: string) {
  return r.applied === "now" ? done : `${r.fromMonth.year}년 ${r.fromMonth.month}월 수업부터 반영돼요`;
}

export function WeeklyManager({ weekly }: { weekly: Weekly[] }) {
  const [editing, setEditing] = useState<string>();
  const sorted = [...weekly].sort((a, b) => sortKey(a) - sortKey(b));
  return (
    <div className="grid grid-cols-1 gap-6">
      <AddForm />
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 등록한 고정 수업 시간이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-1 divide-y rounded-lg border bg-background">
          {sorted.map((w) =>
            editing === w.id ? (
              <EditRow key={w.id} w={w} onDone={() => setEditing(undefined)} />
            ) : (
              <ViewRow key={w.id} w={w} onEdit={() => setEditing(w.id)} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function TimeFields({ w }: { w?: Weekly }) {
  return (
    <>
      <select
        name="weekday"
        defaultValue={w?.weekday ?? 1}
        aria-label="요일"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {ORDER.map((d) => (
          <option key={d} value={d}>
            {WEEKDAYS[d]}요일
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <Input type="time" name="start" step={300} defaultValue={w ? formatMinute(w.startMinute) : "19:00"} required aria-label="시작 시간" className="w-32" />
        <span className="text-muted-foreground">–</span>
        <Input type="time" name="end" step={300} defaultValue={w ? formatMinute(w.endMinute) : "20:00"} required aria-label="끝나는 시간" className="w-32" />
      </div>
    </>
  );
}

function AddForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <form
      className="grid gap-3 rounded-lg border bg-background p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const res = await createWeeklySlotAction(form);
          if (res.ok) {
            setError(undefined);
            toast.success("고정 수업 시간을 등록했어요");
          } else setError(res.error);
        });
      }}
    >
      <p className="text-sm font-medium">고정 수업 시간 추가</p>
      <div className="flex flex-wrap items-center gap-2">
        <TimeFields />
        <Button type="submit" disabled={pending}>
          {pending ? "등록하는 중..." : "등록"}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

function ViewRow({ w, onEdit }: { w: Weekly; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const n = w.students.length;

  function remove() {
    const message =
      n > 0
        ? `이 시간에 고정 일정을 둔 학생이 ${n}명 있어요.\n이미 만들어진 달의 수업은 그대로 두고, 그 다음 달부터 이 시간이 없어져요.\n지울까요?`
        : "이 고정 시간을 지울까요?\n앞으로의 빈 슬롯도 함께 지워져요. 예약이 있는 슬롯은 남아요.";
    if (!confirm(message)) return;
    start(async () => {
      const res = await deleteWeeklySlotAction(w.id);
      if (res.ok) toast.success(resultMessage(res.result, "고정 시간을 지웠어요"));
      else toast.error(res.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="grid gap-0.5">
        <p className="font-medium tabular-nums">
          {WEEKDAYS[w.weekday]}요일 {formatMinute(w.startMinute)}–{formatMinute(w.endMinute)}
        </p>
        <p className="text-sm text-muted-foreground">{n > 0 ? `고정 일정 학생 ${n}명 · ${w.students.join(", ")}` : "고정 일정 학생 없음"}</p>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit} disabled={pending}>
          수정
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}>
          삭제
        </Button>
      </div>
    </li>
  );
}

function EditRow({ w, onDone }: { w: Weekly; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const n = w.students.length;
  return (
    <li className="px-4 py-3">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const res = await updateWeeklySlotAction(w.id, form);
            if (res.ok) {
              toast.success(resultMessage(res.result, "바로 반영했어요"));
              onDone();
            } else setError(res.error);
          });
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TimeFields w={w} />
        </div>
        {n > 0 ? (
          <div className="grid gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              이 시간에 고정 일정을 둔 학생이 {n}명 있어요. 이미 만들어진 달의 수업은 그대로 두고 그 다음 달부터 새 시간으로 바뀌어요. 학생 고정 일정도
              새 시간으로 따라가요.
            </p>
            <Input name="reason" placeholder="바꾸는 이유 (학생 일정 변경 이력에 남아요)" maxLength={200} required className="bg-background" aria-label="바꾸는 이유" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">고정 일정 학생이 없어서 바로 반영돼요. 앞으로의 빈 슬롯이 새 시간으로 바뀌어요.</p>
        )}
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "저장하는 중..." : "저장"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            취소
          </Button>
        </div>
      </form>
    </li>
  );
}
