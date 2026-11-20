"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOUR_SLIDES } from "./slides";

// 앱 둘러보기 창 (AUTH-14, 인투디헤븐 온보딩과 같은 방식).
// 폰은 화면 전체, PC는 가운데 폰 크기 창. 옆으로 밀거나 화살표·점·키보드(←→, Esc)로 넘긴다

type Rect = { top: number; left: number; width: number; height: number };

/** 이만큼 옆으로 밀면 넘긴다 */
const SWIPE_PX = 50;

export function TourModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 열 때마다 새로 만들어 첫 화면부터 시작한다
  return open ? <TourDialog onClose={onClose} /> : null;
}

function TourDialog({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const slide = TOUR_SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === TOUR_SLIDES.length - 1;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prev;
    };
  }, []);

  const go = useCallback(
    (to: number) => {
      if (fading || to === index || to < 0 || to >= TOUR_SLIDES.length) return;
      setDir(to > index ? 1 : -1);
      setFading(true);
      setRect(null);
      setTimeout(() => {
        setIndex(to);
        setFading(false);
      }, 150);
    },
    [fading, index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose]);

  // 강조할 곳의 위치를 잰다. 창 크기가 바뀌면(PC 창 줄이기, 폰 돌리기) 다시 잰다
  useLayoutEffect(() => {
    const box = screenRef.current;
    if (fading || !box || !slide.tip) return;
    const measure = () => {
      const el = box.querySelector("[data-highlight]");
      if (!el) return setRect(null);
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - b.top, left: r.left - b.left, width: r.width, height: r.height });
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fading, index, slide.tip]);

  const { Screen, tip, tipAt } = slide;
  const pad = 6;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[100] flex items-center justify-center bg-black/70 transition-opacity duration-300 sm:p-6", visible ? "opacity-100" : "opacity-0")}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="앱 둘러보기"
        tabIndex={-1}
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-background outline-none sm:h-[min(820px,100%)] sm:max-w-[400px] sm:rounded-[28px] sm:shadow-2xl"
      >
        {/* 가짜 화면 */}
        <div
          ref={screenRef}
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden pt-[env(safe-area-inset-top)] transition-[opacity,transform] duration-150 select-none",
            fading ? cn("opacity-0", dir === 1 ? "-translate-x-4" : "translate-x-4") : "translate-x-0 opacity-100",
          )}
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
            go(dx < 0 ? index + 1 : index - 1);
          }}
        >
          {/* 가짜 화면은 눌러도 아무 일이 없다 (마지막 버튼만) */}
          <div className={cn("h-full", tip && "pointer-events-none")} aria-hidden={tip ? true : undefined}>
            <Screen onDone={onClose} />
          </div>

          {tip && rect && (
            <>
              {/* 강조한 곳만 밝게 */}
              <div
                className="pointer-events-none absolute rounded-xl"
                style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)" }}
              />
              <div
                className="pointer-events-none absolute rounded-xl border-2 border-white/30"
                style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
              />
              <div
                role="note"
                className="absolute inset-x-4 rounded-2xl bg-white px-4 py-3.5 shadow-xl"
                style={tipAt === "top" ? { bottom: `calc(100% - ${rect.top - pad}px + 14px)` } : { top: rect.top + rect.height + pad + 14 }}
              >
                <span
                  className={cn(
                    "absolute left-8 h-0 w-0 border-x-8 border-x-transparent",
                    tipAt === "top" ? "-bottom-2 border-t-8 border-t-white" : "-top-2 border-b-8 border-b-white",
                  )}
                />
                <p className="text-[15px] leading-relaxed break-keep text-neutral-900">{tip}</p>
              </div>
            </>
          )}
        </div>

        {/* 아래 조작 줄 */}
        <div className="bg-neutral-900 pb-[env(safe-area-inset-bottom)] text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <button type="button" onClick={onClose} className="min-w-20 text-left text-sm text-white/60 transition-colors hover:text-white">
              {isLast ? "닫기" : "건너뛰기"}
            </button>
            <div className="flex items-center gap-1.5">
              {TOUR_SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`${i + 1}번째 화면`}
                  aria-current={i === index}
                  onClick={() => go(i)}
                  className={cn("h-2 rounded-full transition-all duration-300", i === index ? "w-5 bg-white" : "w-2 bg-white/30 hover:bg-white/50")}
                />
              ))}
            </div>
            <div className="flex min-w-20 items-center justify-end gap-1">
              <button
                type="button"
                aria-label="이전"
                onClick={() => go(index - 1)}
                disabled={isFirst}
                className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:text-white/20 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="다음"
                onClick={() => go(index + 1)}
                disabled={isLast}
                className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:text-white/20 disabled:hover:bg-transparent"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
