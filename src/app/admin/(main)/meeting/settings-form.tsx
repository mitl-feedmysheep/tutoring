"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/auth/auth-card";
import { saveMeetingSettingsAction } from "@/app/admin/meeting-actions";
import { cn } from "@/lib/utils";

type Provider = "GOOGLE_MEET" | "FIXED_LINK";

const OPTIONS: { value: Provider; title: string; desc: string }[] = [
  { value: "GOOGLE_MEET", title: "Google Meet 자동", desc: "수업마다 Meet 링크를 만들어요. 구글 계정 연결이 필요해요." },
  { value: "FIXED_LINK", title: "고정 링크", desc: "Zoom 개인 회의실처럼 늘 같은 링크를 한 번 붙여 넣어요. 모든 수업이 이 링크로 열려요." },
];

export function MeetingSettingsForm({ provider, fixedUrl, googleConnected }: { provider: Provider | null; fixedUrl: string | null; googleConnected: boolean }) {
  const [state, action, pending] = useActionState(saveMeetingSettingsAction, undefined);
  const [picked, setPicked] = useState<Provider | null>(provider);

  return (
    <form
      // form action으로 넘기면 저장 뒤 React가 폼을 처음 값으로 되돌려 고른 방식 표시가 어긋난다. 직접 넘긴다
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid gap-4 rounded-lg border bg-background p-4"
    >
      {provider === null && <p className="text-sm text-amber-700">아직 방식을 고르지 않았어요. 학생이 &quot;들어가기&quot;를 눌러도 열리지 않아요.</p>}
      <div className="grid gap-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn("flex cursor-pointer gap-3 rounded-md border p-3", picked === o.value ? "border-emerald-600 bg-emerald-50/60" : "hover:bg-muted/50")}
          >
            <input type="radio" name="provider" value={o.value} checked={picked === o.value} onChange={() => setPicked(o.value)} className="mt-1 accent-emerald-600" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <div className={cn("grid gap-1.5", picked !== "FIXED_LINK" && "hidden")}>
        <label htmlFor="fixedUrl" className="text-sm font-medium">
          고정 링크
        </label>
        <Input id="fixedUrl" name="fixedUrl" type="url" inputMode="url" maxLength={500} placeholder="https://zoom.us/j/..." defaultValue={fixedUrl ?? ""} />
        <p className="text-xs text-muted-foreground">늘 같은 방이라 Zoom에서 대기실이나 암호를 켜 두는 것이 좋아요.</p>
      </div>

      {picked === "GOOGLE_MEET" && !googleConnected && <p className="text-sm text-amber-700">아래에서 구글 계정을 연결해야 링크가 만들어져요.</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || picked === null}>
          {pending ? "저장 중..." : "저장"}
        </Button>
        {state?.ok && !pending && <span className="text-sm text-emerald-700">저장했어요</span>}
      </div>
      <FormError message={state?.error} />
    </form>
  );
}
