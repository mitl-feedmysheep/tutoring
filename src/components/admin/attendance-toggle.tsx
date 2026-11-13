"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setAttendanceAction } from "@/app/admin/lesson-record-actions";

type Value = "COMPLETED" | "ABSENT" | null;

const OPTIONS = [
  { value: "COMPLETED", label: "완료", on: "border-emerald-600 bg-emerald-600 text-white" },
  { value: "ABSENT", label: "결석", on: "border-amber-500 bg-amber-500 text-white" },
] as const;

/** 완료·결석 체크 (LESSON-01, 03). 누른 것을 다시 누르면 체크가 풀린다 */
export function AttendanceToggle({ lessonId, value, name }: { lessonId: string; value: Value; name?: string }) {
  const [shown, setShown] = useOptimistic(value);
  const [pending, start] = useTransition();

  function pick(next: Exclude<Value, null>) {
    const v = shown === next ? null : next;
    start(async () => {
      setShown(v);
      const res = await setAttendanceAction(lessonId, v);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div role="group" aria-label={name ? `${name} 출석` : "출석"} className="flex shrink-0 gap-1">
      {OPTIONS.map((o) => {
        const on = shown === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => pick(o.value)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-wait",
              on ? o.on : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
