"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyWeeklyChangeAction, planWeeklyChangeAction } from "@/app/lesson-actions";
import { goBack } from "@/components/app/nav";
import { Card, GroupTitle, Row } from "@/components/app/ui";
import { clockText, dayLabel, formatMinute, WEEKDAYS } from "@/lib/schedule/kst";
import type { WeeklyMode, WeeklyPlan } from "@/lib/schedule/weekly";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";

export type WeeklyChoiceView = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  mine: boolean;
  /** 선생님이 바꾸거나 지우는 중일 때 한 줄 안내 */
  note: string | null;
  /** 선생님이 지운 시간. 빼기만 할 수 있다 */
  closed: boolean;
};

const cta = "flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-bold transition-colors disabled:opacity-50";
const short = (w: { weekday: number; startMinute: number }) => `${WEEKDAYS[w.weekday]} ${formatMinute(w.startMinute)}`;

// 시안의 고정 일정 화면: 선생님 고정 시간 중에서 여러 개 고르고 바꾸기 → "이번만 / 앞으로 전부" 확인창
export function WeeklyPicker({ choices }: { choices: WeeklyChoiceView[] }) {
  const router = useRouter();
  const initial = useMemo(() => new Set(choices.filter((c) => c.mine).map((c) => c.id)), [choices]);
  const [picked, setPicked] = useState(initial);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [mode, setMode] = useState<WeeklyMode>("all");
  const [pending, start] = useTransition();

  const changed = picked.size !== initial.size || [...picked].some((id) => !initial.has(id));
  const hadSchedule = initial.size > 0;

  const toggle = (c: WeeklyChoiceView) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else if (!c.closed) next.add(c.id);
      return next;
    });

  const openSheet = () =>
    start(async () => {
      const res = await planWeeklyChangeAction([...picked]);
      if (!res.ok) return void toast.error(res.error);
      setMode("all");
      setPlan(res.plan);
    });

  const apply = () =>
    start(async () => {
      const res = await applyWeeklyChangeAction([...picked], mode);
      if (!res.ok) return void toast.error(res.error);
      const once = mode === "once" && plan?.once;
      setPlan(null);
      toast.success(once ? `${dayLabel(once.fromAt)} 수업을 ${dayLabel(once.toAt)} ${clockText(once.toAt)}으로 옮겼어요` : "고정 일정을 바꿨어요");
      goBack(router, "/lessons");
    });

  return (
    <>
      <div className="flex flex-col gap-4">
        <GroupTitle>
          선생님 고정 수업 시간
          <small className="ml-2 text-[13px] font-normal text-muted-foreground">여러 개 고를 수 있어요</small>
        </GroupTitle>
        <Card>
          {choices.map((c) => {
            const on = picked.has(c.id);
            return (
              <Row key={c.id}>
                <span className="min-w-0">
                  {WEEKDAYS[c.weekday]} {formatMinute(c.startMinute)} – {formatMinute(c.endMinute)}
                  {c.note && <small className="block text-[12px] text-amber-700">{c.note}</small>}
                </span>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={pending || (!on && c.closed)}
                  onClick={() => toggle(c)}
                  className={cn(
                    "shrink-0 rounded-full border-[1.5px] px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {on ? (c.mine ? "내 일정" : "선택함") : "선택"}
                </button>
              </Row>
            );
          })}
        </Card>
      </div>

      <button type="button" disabled={!changed || pending} onClick={openSheet} className={`${cta} mt-2 bg-primary text-primary-foreground`}>
        {hadSchedule ? "바꾸기" : "정하기"}
      </button>

      {plan && (
        <BottomSheet
          open
          onOpenChange={(o) => !o && setPlan(null)}
          title={summary(plan)}
          description={plan.changes.length > 0 ? "언제부터 바꿀까요?" : undefined}
        >
          {plan.changes.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Option on={mode === "once"} disabled={!plan.once} onClick={() => setMode("once")} title="이번만">
                {onceText(plan)}
              </Option>
              <Option on={mode === "all"} onClick={() => setMode("all")} title="앞으로 전부">
                {allText(plan)}
              </Option>
            </div>
          ) : (
            // 추가·빼기만 있으면 고를 게 없으므로 안내만
            <p className="text-sm leading-relaxed text-muted-foreground">{allText(plan)}</p>
          )}
          <button type="button" disabled={pending} onClick={apply} className={`${cta} bg-primary text-primary-foreground`}>
            {hadSchedule ? "바꾸기" : "정하기"}
          </button>
        </BottomSheet>
      )}
    </>
  );
}

function Option({ on, disabled, onClick, title, children }: { on: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors disabled:opacity-50",
        on ? "border-primary bg-accent/60" : "border-border",
      )}
    >
      <b className="text-[15px]">{title}</b>
      <span className="text-[13px] leading-relaxed text-muted-foreground">{children}</span>
    </button>
  );
}

/** "목 19:00 → 수 20:00", "+ 토 10:00", "− 화 19:00" */
function summary(plan: WeeklyPlan) {
  return [
    ...plan.changes.map((c) => `${short(c.from)} → ${short(c.to)}`),
    ...plan.adds.map((a) => `+ ${short(a.to)}`),
    ...plan.removes.map((r) => `− ${short(r.from)}`),
  ].join(", ");
}

function onceText(plan: WeeklyPlan) {
  const o = plan.once;
  if (!o) return "옮길 수 있는 수업이 없어요";
  return `${dayLabel(o.fromAt)} 수업만 ${dayLabel(o.toAt)} ${clockText(o.toAt)}으로 옮겨요`;
}

const from = (d: Date | null) => (d ? `${dayLabel(d)}부터` : "다음 달부터");

function allText(plan: WeeklyPlan) {
  const lines: string[] = [];
  if (plan.changes.length === 1 && plan.adds.length === 0 && plan.removes.length === 0) {
    const c = plan.changes[0];
    lines.push(`${from(c.firstAt)} 매주 ${short(c.to)}으로 바뀌고, 다음 달부터도 이 시간으로 잡혀요.`);
  } else {
    for (const c of plan.changes) lines.push(`${short(c.from)} → ${short(c.to)}: ${from(c.firstAt)}`);
    for (const a of plan.adds) lines.push(`${short(a.to)} 수업: ${from(a.firstAt)} 매주 잡혀요`);
    for (const r of plan.removes) lines.push(r.firstAt ? `${short(r.from)} 수업: ${dayLabel(r.firstAt)}부터 없어져요` : `${short(r.from)} 수업: 앞으로 잡히지 않아요`);
  }
  if (plan.keptSoon > 0) lines.push("1시간 안에 시작하는 수업은 그대로예요.");
  return lines.map((l) => (
    <span key={l} className="block">
      {l}
    </span>
  ));
}
