"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// 사진 크게 보기. 화면 전체를 덮고, 여러 장이면 좌우로 넘긴다. 바깥이나 ×를 누르면 닫는다
export function PhotoViewer({ urls, index, onIndexChange }: { urls: string[]; index: number | null; onIndexChange: (i: number | null) => void }) {
  const open = index !== null && index < urls.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndexChange(null);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < urls.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, index, urls.length, onIndexChange]);

  if (!open) return null;
  const nav = "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="사진 보기" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => onIndexChange(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL이라 next/image를 쓰지 않는다 */}
      <img src={urls[index]} alt={`사진 ${index + 1}`} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="닫기" className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 flex size-10 items-center justify-center rounded-full bg-white/15 text-white">
        <X className="size-5" />
      </button>
      {urls.length > 1 && (
        <span className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] rounded-full bg-white/15 px-3 py-1 text-sm text-white tabular-nums">
          {index + 1} / {urls.length}
        </span>
      )}
      {index > 0 && (
        <button type="button" aria-label="이전 사진" className={`${nav} left-3`} onClick={(e) => (e.stopPropagation(), onIndexChange(index - 1))}>
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < urls.length - 1 && (
        <button type="button" aria-label="다음 사진" className={`${nav} right-3`} onClick={(e) => (e.stopPropagation(), onIndexChange(index + 1))}>
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>,
    document.body,
  );
}
