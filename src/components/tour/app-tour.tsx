"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { TourModal } from "./tour-modal";

// 웹앱 로그인 화면의 "앱 둘러보기" (AUTH-14). 이 기기에서 처음 들어오면 한 번 저절로 띄운다
const SEEN_KEY = "tour.seen";

function wasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // 저장소를 못 쓰면 매번 띄우지 않는다
  }
}

export function AppTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wasSeen()) return;
    // 로그인 화면이 먼저 보이고 나서 살짝 뒤에 띄운다
    const timer = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-accent"
      >
        <Sparkles className="size-4" />
        앱 둘러보기
      </button>
      <TourModal open={open} onClose={close} />
    </>
  );
}
