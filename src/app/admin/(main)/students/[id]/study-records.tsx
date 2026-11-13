"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PhotoViewer } from "@/components/app/study/photo-viewer";
import { minutesText } from "@/lib/study/rules";
import { cn } from "@/lib/utils";

type Total = { minutes: number; studiedDays: number; days: number };
type Day = { date: string; label: string; entries: { id: string; minutes: number; memo: string; photos: { id: string; url: string }[] }[] };

// 학생 카드의 공부 기록 (STUDY-06). 합계, 달마다 날짜별 기록과 사진. 선생님은 보기만 한다
export function StudyRecords({
  monthLabel,
  prevHref,
  nextHref,
  summary,
  days,
}: {
  monthLabel: string;
  prevHref: string;
  nextHref: string | null;
  summary: { week: Total; month: Total; all: Total };
  days: Day[];
}) {
  const [viewing, setViewing] = useState<{ urls: string[]; index: number } | null>(null);
  const arrow = "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted";

  return (
    <section id="study" className="grid scroll-mt-4 gap-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">공부 기록</h3>
        <p className="text-sm text-muted-foreground tabular-nums">
          {(
            [
              ["이번 주", summary.week],
              ["이번 달", summary.month],
              ["누적", summary.all],
            ] as const
          ).map(([label, t], i) => (
            <span key={label}>
              {i > 0 && " · "}
              {label} <b className="font-medium text-foreground">{minutesText(t.minutes)}</b> ({t.days}일 중 {t.studiedDays}일)
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Link href={prevHref} scroll={false} aria-label="이전 달" className={arrow}>
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-24 text-center text-sm font-medium tabular-nums">{monthLabel}</span>
        {nextHref ? (
          <Link href={nextHref} scroll={false} aria-label="다음 달" className={arrow}>
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span aria-hidden className={cn(arrow, "opacity-30 hover:bg-transparent")}>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 달에는 공부 기록이 없어요.</p>
      ) : (
        <ul className="grid divide-y">
          {days.map((d) => (
            <li key={d.date} className="grid gap-2 py-3">
              <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                <span className="font-medium">{d.label}</span>
                <span className="text-muted-foreground">{minutesText(d.entries.reduce((s, e) => s + e.minutes, 0))}</span>
              </div>
              {d.entries.map((e) => (
                <div key={e.id} className="grid gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 font-medium text-emerald-700 tabular-nums">{minutesText(e.minutes)}</span>
                    <p className="min-w-0 whitespace-pre-line text-muted-foreground">{e.memo || "내용 없음"}</p>
                  </div>
                  {e.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {e.photos.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setViewing({ urls: e.photos.map((x) => x.url), index: i })}
                          className="size-16 overflow-hidden rounded-md bg-muted"
                          aria-label={`사진 ${i + 1} 크게 보기`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL이라 next/image를 쓰지 않는다 */}
                          <img src={p.url} alt="" className="size-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <PhotoViewer urls={viewing?.urls ?? []} index={viewing?.index ?? null} onIndexChange={(i) => setViewing((v) => (v && i !== null ? { ...v, index: i } : null))} />
    </section>
  );
}
