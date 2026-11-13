"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** APP-16: 들어가기는 수업 시작 10분 전부터 끝날 때까지 */
const ENTER_BEFORE_MS = 10 * 60_000;

export type NextLessonView = {
  id: string;
  startsAt: string;
  endsAt: string;
  dayText: string;
  timeText: string;
  kindText: string;
};

// 수업 탭 다음 수업 카드 (APP-02, APP-16)
export function NextLessonCard({ lesson }: { lesson: NextLessonView | null }) {
  if (!lesson) {
    return (
      <section className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
        <small className="text-[13px] opacity-85">다음 수업</small>
        <b className="text-lg">예정된 수업이 없어요</b>
        <Link href="/book" className="mt-1 self-start text-sm font-semibold underline underline-offset-4">
          수업 예약하기
        </Link>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
      <Link href={`/lessons/${lesson.id}`} className="flex flex-col gap-1">
        <small className="text-[13px] opacity-85">다음 수업 · {lesson.dayText}</small>
        <b className="text-xl tabular-nums">{lesson.timeText}</b>
      </Link>
      <EnterRow lesson={lesson} />
    </section>
  );
}

function EnterRow({ lesson }: { lesson: NextLessonView }) {
  const open = useEnterOpen(lesson.startsAt, lesson.endsAt);
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span>{lesson.kindText}</span>
        <button
          type="button"
          disabled={!open}
          onClick={() => {
            // TODO(6단계): 서버가 시간을 다시 확인하고 Meet 링크를 연다 (MEET-05)
            toast.info("Meet 연결은 준비 중이에요");
          }}
          className={cn("rounded-full bg-white px-5 py-2 text-sm font-bold text-primary transition-opacity", !open && "opacity-45")}
        >
          들어가기
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
