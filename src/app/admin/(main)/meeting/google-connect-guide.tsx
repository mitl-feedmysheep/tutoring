"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// MEET-01: "구글 계정 연결"을 누르면 바로 구글로 보내지 않고, 앞으로 나올 구글 화면에서 무엇을 누를지 먼저 보여 준다
const STEPS = [
  { src: "/guide/google-connect-account.png", text: "수업을 진행할 구글 계정을 골라요." },
  {
    src: "/guide/google-connect-warning.png",
    text: "\"Google에서 확인하지 않은 앱\" 화면이 나오면 ① \"고급\"을 누르고 ② 아래에 나온 \"intotheheaven.app(으)로 이동(안전하지 않음)\"을 눌러요. 우리 서비스라 괜찮아요.",
  },
  { src: "/guide/google-connect-continue.png", text: "\"계속\"을 눌러요." },
  {
    src: "/guide/google-connect-permission.png",
    text: "① \"모든 캘린더의 일정 보기 및 수정\" 체크박스를 꼭 체크하고 ② \"계속\"을 눌러요. 체크하지 않으면 연결되지 않아요.",
    strong: true,
  },
];

export function GoogleConnectGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-fit items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
      >
        구글 계정 연결
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-guide-title"
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 id="google-guide-title" className="text-lg font-semibold">
                구글 계정 연결 순서
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <ol className="grid gap-6 overflow-y-auto px-5 py-5">
              {STEPS.map((s, i) => (
                <li key={s.src} className="grid gap-2">
                  <p className="flex gap-2 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{i + 1}</span>
                    <span className={s.strong ? "font-semibold text-foreground" : ""}>{s.text}</span>
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 안내용 정적 캡쳐 */}
                  <img src={s.src} alt={`${i + 1}단계 화면`} className="w-full rounded-md border" />
                </li>
              ))}
              <li className="text-sm text-muted-foreground">
                끝나면 이 화면으로 돌아와 &quot;구글 계정을 연결했어요&quot;가 보여요.
              </li>
            </ol>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                닫기
              </Button>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <a href="/api/google/connect">연결하러 가기</a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
