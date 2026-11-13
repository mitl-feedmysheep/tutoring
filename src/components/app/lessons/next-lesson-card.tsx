"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enterLessonAction } from "@/app/meeting-actions";

/** APP-16: 들어가기는 수업 시작 10분 전부터 끝날 때까지 (서버 meeting.ts ENTER_BEFORE_MS와 같다) */
const ENTER_BEFORE_MS = 10 * 60_000;

export type NextLessonView = {
  /** 학생은 수업 id, 선생님은 슬롯 id. 들어가기에 쓴다 */
  id: string;
  /** 누르면 열 수업 화면. 선생님 카드는 없음 */
  href?: string;
  startsAt: string;
  endsAt: string;
  dayText: string;
  timeText: string;
  kindText: string;
};

// 수업 탭 다음 수업 카드 (APP-02, APP-16, MEET-04). 선생님·학생 공용
export function NextLessonCard({ lesson, emptyAction = true }: { lesson: NextLessonView | null; emptyAction?: boolean }) {
  if (!lesson) {
    return (
      <section className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
        <small className="text-[13px] opacity-85">다음 수업</small>
        <b className="text-lg">예정된 수업이 없어요</b>
        {emptyAction && (
          <Link href="/book" className="mt-1 self-start text-sm font-semibold underline underline-offset-4">
            수업 예약하기
          </Link>
        )}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
      <LessonTitle lesson={lesson} />
      <EnterRow lesson={lesson} />
    </section>
  );
}

function LessonTitle({ lesson }: { lesson: NextLessonView }) {
  const inner = (
    <>
      <small className="text-[13px] opacity-85">다음 수업 · {lesson.dayText}</small>
      <b className="text-xl tabular-nums">{lesson.timeText}</b>
    </>
  );
  return lesson.href ? (
    <Link href={lesson.href} className="flex flex-col gap-1">
      {inner}
    </Link>
  ) : (
    <div className="flex flex-col gap-1">{inner}</div>
  );
}

/** 홈 화면 앱(standalone)인지. 이때는 새 창 대신 지금 화면에서 링크를 연다 */
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function EnterRow({ lesson }: { lesson: NextLessonView }) {
  const open = useEnterOpen(lesson.startsAt, lesson.endsAt);
  const [pending, startTransition] = useTransition();

  const enter = () => {
    // 브라우저는 클릭 직후에 연 창만 허용한다. 링크를 받기 전에 빈 창을 먼저 연다
    const win = isStandalone() ? null : window.open("", "_blank");
    startTransition(async () => {
      const r = await enterLessonAction(lesson.id);
      if (!r.ok) {
        win?.close();
        toast.error(r.error);
        return;
      }
      if (win) win.location.href = r.url;
      else window.location.assign(r.url);
    });
  };

  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{lesson.kindText}</span>
        <button
          type="button"
          disabled={!open || pending}
          onClick={enter}
          className={cn("rounded-full bg-white px-5 py-2 text-sm font-bold text-primary transition-opacity", (!open || pending) && "opacity-45")}
        >
          {pending ? "여는 중…" : "들어가기"}
        </button>
      </div>
      {!open && <small className="text-right text-xs opacity-85">10분 전부터 들어갈 수 있어요</small>}
    </>
  );
}

/** 새로 고침 없이 시간이 되면 켜진다. 앱이 다시 보일 때도 다시 잰다 */
function useEnterOpen(startsAt: string, endsAt: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  if (now === null) return false;
  return now >= new Date(startsAt).getTime() - ENTER_BEFORE_MS && now < new Date(endsAt).getTime();
}
