"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { pushStatusAction, removePushAction, savePushAction, testPushAction } from "@/app/push-actions";
import { currentSubscription, enablePush, isIos, pushSupport } from "@/lib/app/push-client";
import { Card, Notice, Row, Rule } from "./ui";

type State = "loading" | "ios-install" | "unsupported" | "denied" | "off" | "on";

// MY > 알림 설정 (APP-12, APP-18). 이 기기 알림을 켜고 끄는 스위치 하나. 시험 알림은 선생님에게만
export function NotificationSettings({ publicKey, canTest }: { publicKey: string | null; canTest: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      let next: State;
      if (support !== "ok") next = support;
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = await currentSubscription();
        const res = sub ? await pushStatusAction(sub.endpoint) : null;
        next = res?.ok && res.subscribed ? "on" : "off";
      }
      if (alive) setState(next);
    })().catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    const permission = await enablePush(publicKey, savePushAction);
    setState(permission === "granted" ? "on" : permission === "denied" ? "denied" : "off");
  }

  async function turnOff() {
    const sub = await currentSubscription();
    if (sub) {
      const res = await removePushAction(sub.endpoint);
      if (!res.ok) throw new Error(res.error);
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
  }

  async function toggle() {
    setBusy(true);
    try {
      await (state === "on" ? turnOff() : turnOn());
    } catch {
      toast.error("알림 설정을 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const sub = await currentSubscription();
    if (!sub) return setState("off");
    setBusy(true);
    const res = await testPushAction(sub.endpoint).finally(() => setBusy(false));
    if (res.ok) toast.success("시험 알림을 보냈어요");
    else toast.error(res.error);
  }

  if (state === "loading") return <Card><Row><span className="text-muted-foreground">확인하는 중…</span></Row></Card>;

  if (state === "ios-install") return <IosInstallGuide />;

  if (state === "unsupported") return <Notice>이 브라우저에서는 알림을 받을 수 없어요. 크롬이나 사파리로 열어 주세요.</Notice>;

  if (!publicKey) return <Notice>알림을 준비하고 있어요. 조금 뒤에 다시 들어와 주세요.</Notice>;

  return (
    <>
      <Card>
        <Row>
          <span>이 기기에서 알림 받기</span>
          <Switch checked={state === "on"} disabled={busy || state === "denied"} onChange={toggle} />
        </Row>
        {state === "on" && canTest && (
          <Row>
            <span className="text-muted-foreground">알림이 오는지 확인</span>
            <button type="button" onClick={test} disabled={busy} className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-bold text-primary disabled:opacity-50">
              시험 알림
            </button>
          </Row>
        )}
      </Card>
      {state === "denied" && (
        <Notice>
          알림이 막혀 있어요. {isIos() ? "아이폰 설정 → 알림 → Tutoring" : "브라우저나 기기 설정"}에서 알림을 허용한 뒤 다시 들어와 주세요.
        </Notice>
      )}
      <Rule>
        수업 30분 전, 예약 변경, 게시판 글처럼 꼭 필요한 것만 알려 드려요. 알림은 기기마다 따로 켜요. 로그아웃하면 이 기기 알림은 꺼져요.
      </Rule>
    </>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="이 기기에서 알림 받기"
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-input"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function IosInstallGuide() {
  return (
    <>
      <Notice>아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.</Notice>
      <Card>
        <ol className="flex list-decimal flex-col gap-2 px-4 py-3.5 pl-9 text-[15px] leading-relaxed">
          <li>사파리 아래쪽 공유 버튼(네모에 위쪽 화살표)을 눌러요.</li>
          <li>&lsquo;홈 화면에 추가&rsquo;를 눌러요.</li>
          <li>홈 화면의 Tutoring 앱으로 열고 로그인해요.</li>
          <li>MY → 알림 설정에서 알림을 켜요.</li>
        </ol>
      </Card>
    </>
  );
}
