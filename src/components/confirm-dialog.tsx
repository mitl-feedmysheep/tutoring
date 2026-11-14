"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// 브라우저 기본 confirm() 대신 쓰는 확인 창. 루트 레이아웃에 <ConfirmHost />를 하나 두고,
// 어디서든 `if (!(await askConfirm({ ... }))) return;` 처럼 쓴다

type Options = {
  title: string;
  /** 줄바꿈(\n)은 그대로 보여 준다 */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 지우기·비활성화처럼 되돌리기 어려운 일이면 빨간 버튼 */
  destructive?: boolean;
};

type Request = Options & { resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function askConfirm(options: Options): Promise<boolean> {
  // 이미 떠 있는 창이 있으면 그건 "취소"로 닫는다
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const req = current;
  current = null;
  emit();
  req?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const req = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => settle(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={req.description ? "confirm-desc" : undefined}
        className="grid w-full max-w-sm gap-4 rounded-xl bg-white p-6 text-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-1.5">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {req.title}
          </h2>
          {req.description && (
            <p id="confirm-desc" className="text-sm whitespace-pre-line text-muted-foreground">
              {req.description}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {req.cancelLabel ?? "그대로 둘게요"}
          </Button>
          <Button
            autoFocus
            onClick={() => settle(true)}
            className={req.destructive ? "bg-red-600 text-white hover:bg-red-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}
          >
            {req.confirmLabel ?? "확인"}
          </Button>
        </div>
      </div>
    </div>
  );
}
