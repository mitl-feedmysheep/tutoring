"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deactivateStudentAction, reactivateStudentAction, setOccupationAction } from "@/app/admin/actions";

/** AUTH-05: 학생 카드 위쪽 직업. 선생님이 입력하고, 비우고 저장하면 없앤다 */
export function OccupationField({ studentId, occupation }: { studentId: string; occupation: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(occupation ?? "");
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">직업</span>
        <span>{occupation ?? <span className="text-muted-foreground">없음</span>}</span>
        <button
          type="button"
          className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
          onClick={() => {
            setValue(occupation ?? "");
            setEditing(true);
          }}
        >
          {occupation ? "고치기" : "입력"}
        </button>
      </p>
    );
  }

  const save = () =>
    start(async () => {
      const r = await setOccupationAction(studentId, value);
      if (!r.ok) return void toast.error(r.error);
      setEditing(false);
      toast.success("저장했어요");
    });

  return (
    <form
      className="flex max-w-sm items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input
        aria-label="직업"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={100}
        placeholder="예: 회사원, 대학생"
        autoFocus
        className="h-8"
      />
      <Button type="submit" size="sm" disabled={pending}>
        저장
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
        취소
      </Button>
    </form>
  );
}

/** ADMIN-04: 비활성화 */
export function DeactivateButton({ studentId, name }: { studentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        const ok = confirm(
          `${name} 학생을 비활성화할까요?\n\n` +
            "- 학생은 바로 로그아웃되고 로그인할 수 없어요.\n" +
            "- 앞으로 잡힌 수업은 모두 취소돼요. 고정 일정은 남지만 새 수업은 만들어지지 않아요.\n" +
            "- 기록은 남고, 학생 목록 아래 '비활성 학생'에서 다시 활성화할 수 있어요.",
        );
        if (!ok) return;
        start(async () => {
          const r = await deactivateStudentAction(studentId);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.canceled ? `비활성화했어요. 앞으로의 수업 ${r.canceled}개를 취소했어요` : "비활성화했어요");
        });
      }}
    >
      비활성화
    </Button>
  );
}

/** ADMIN-04: 다시 활성화 */
export function ReactivateButton({ studentId, name }: { studentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${name} 학생을 다시 활성화할까요?\n비활성화 때 취소된 수업과 고정 일정이 다시 잡혀요.`)) return;
        start(async () => {
          const r = await reactivateStudentAction(studentId);
          if (!r.ok) return void toast.error(r.error);
          toast.success("다시 활성화했어요. 학생은 원래 비밀번호로 로그인하면 돼요");
        });
      }}
    >
      다시 활성화
    </Button>
  );
}
