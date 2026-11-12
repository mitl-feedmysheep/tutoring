"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/auth/auth-card";
import { formatKst } from "@/lib/time";
import { issueInviteAction } from "@/app/admin/actions";

export function IssueInviteForm() {
  const [state, action, pending] = useActionState(issueInviteAction, undefined);
  const [copied, setCopied] = useState<string>();
  // 원본 토큰은 DB에 없어서 발급 직후 이 화면에서만 볼 수 있다
  const link = state?.token ? `${window.location.origin}/invite/${state.token}` : undefined;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      toast.error("복사하지 못했어요. 링크를 직접 선택해서 복사해 주세요");
    }
  }

  return (
    <div className="grid gap-4">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <Input name="memo" placeholder="누구에게 보낼 링크인지 (선택)" maxLength={50} className="sm:max-w-xs" aria-label="메모" />
        <Button type="submit" disabled={pending}>
          {pending ? "발급 중..." : "새 링크 발급"}
        </Button>
      </form>
      <FormError message={state?.error} />
      {link && state?.expiresAt && (
        <div className="grid gap-2 rounded-lg border bg-background p-4">
          <p className="text-sm font-medium">링크를 복사해서 학생에게 보내 주세요</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="초대 링크" />
            <Button type="button" variant="outline" onClick={copy} className="shrink-0">
              {copied === link ? <Check /> : <Copy />}
              {copied === link ? "복사됨" : "복사"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatKst(new Date(state.expiresAt))}까지 한 번만 쓸 수 있어요. 이 화면을 벗어나면 링크를 다시 볼 수 없으니, 잃어버리면 새로 발급하세요.
          </p>
        </div>
      )}
    </div>
  );
}
