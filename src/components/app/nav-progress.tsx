"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// 화면을 옮기는 동안 가운데에 스피너를 띄운다 (APP-20). 바로 끝나는 이동에서는 깜빡이지 않게 조금 기다렸다 띄운다

const SHOW_AFTER_MS = 150;
/** 이동이 실패하거나 취소돼도 스피너가 남지 않게 */
const GIVE_UP_MS = 15_000;

type Nav = { id: number; from: string };
const listeners = new Set<() => void>();
let seq = 0;

/** 지금 주소. usePathname + useSearchParams로 만든 것과 같은 모양 */
const hereNow = () => `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;

/** 코드로 화면을 옮기기 직전에 부른다 (router.push·replace·back). 링크 누르기는 알아서 잡는다 */
export function startNav() {
  listeners.forEach((l) => l());
}

/**
 * 같은 화면으로 가는 링크, 새 창, 다른 사이트, 다운로드는 이동으로 치지 않는다.
 * defaultPrevented는 보지 않는다: Next Link가 화면 안 이동을 하려고 늘 기본 동작을 막기 때문이다
 */
function isNavClick(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return false;
  const to = new URL(a.href, window.location.href);
  if (to.origin !== window.location.origin) return false;
  return to.pathname + to.search !== window.location.pathname + window.location.search;
}

function Progress() {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  const [nav, setNav] = useState<Nav | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  // 시작한 주소에서 벗어나면 이동이 끝난 것
  const pending = nav !== null && nav.from === here;

  useEffect(() => {
    const begin = () => setNav({ id: ++seq, from: hereNow() });
    const onClick = (e: MouseEvent) => {
      if (isNavClick(e)) begin();
    };
    listeners.add(begin);
    // 링크의 onClick(기록 표시 등)보다 늦게 보도록 bubble 단계에서 본다
    document.addEventListener("click", onClick);
    return () => {
      listeners.delete(begin);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const id = pending ? nav.id : null;
  useEffect(() => {
    if (id === null) return;
    const show = setTimeout(() => setShown(id), SHOW_AFTER_MS);
    const giveUp = setTimeout(() => setNav(null), GIVE_UP_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [id]);

  const visible = id !== null && shown === id;
  if (!visible) return null;
  return (
    <div role="status" aria-label="화면을 여는 중" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-background/90 shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    </div>
  );
}

/** 루트 레이아웃에 하나 둔다 */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
