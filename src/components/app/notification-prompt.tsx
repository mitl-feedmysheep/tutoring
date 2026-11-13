"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { pushStatusAction, savePushAction } from "@/app/push-actions";
import { currentSubscription, enablePush, markPrompted, pushSupport, wasPrompted } from "@/lib/app/push-client";
import { BottomSheet } from "./lessons/bottom-sheet";

// 로그인 뒤 수업 탭에서 한 번 알림을 권한다 (APP-19, 인투디헤븐과 같은 방식).
// 기기의 허용 창은 사용자가 버튼을 눌러야 뜨므로(아이폰) 앱의 창을 먼저 띄우고 "알림 켜기"를 누르면 허용 창을 띄운다
export function NotificationPrompt({ publicKey }: { publicKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicKey || wasPrompted() || pushSupport() !== "ok" || Notification.permission === "denied") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    (async () => {
      const sub = await currentSubscription();
      const res = sub ? await pushStatusAction(sub.endpoint) : null;
      if (!alive) return;
      if (res?.ok && res.subscribed) return markPrompted(); // 이미 켜져 있다
      timer = setTimeout(() => setOpen(true), 1500);
    })().catch(() => {});
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [publicKey]);

  function close() {
    markPrompted();
    setOpen(false);
  }

  async function allow() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await enablePush(publicKey, savePushAction);
      if (permission === "granted") toast.success("알림을 켰어요");
      else toast("알림을 켜지 않았어요. MY → 알림 설정에서 언제든 켤 수 있어요.");
    } catch {
      toast.error("알림을 켜지 못했어요. MY → 알림 설정에서 다시 해 주세요.");
    } finally {
      setBusy(false);
      close();
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && close()} title="알림을 켜 둘까요?">
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent">
          <Bell className="size-7 text-primary" />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          수업 30분 전, 예약 변경, 게시판 새 글을 알려 드려요.
          <br />
          MY → 알림 설정에서 언제든 바꿀 수 있어요.
        </p>
      </div>
      <button
        type="button"
        onClick={allow}
        disabled={busy}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "켜는 중…" : "알림 켜기"}
      </button>
      <button type="button" onClick={close} disabled={busy} className="h-10 w-full text-sm text-muted-foreground">
        나중에
      </button>
    </BottomSheet>
  );
}
