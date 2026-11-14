"use client";

import { useTransition } from "react";
import { askConfirm } from "@/components/confirm-dialog";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { resetPasswordAction } from "@/app/admin/actions";

export function ResetPasswordButton({ id, name, password }: { id: string; name: string; password: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        const ok = await askConfirm({
          title: `${name} 학생의 비밀번호를 초기화할까요?`,
          description: `비밀번호가 ${password}로 바뀌어요. 학생은 다음 로그인 때 새 비밀번호를 정해야 해요.`,
          confirmLabel: "초기화",
        });
        if (!ok) return;
        start(async () => {
          const ok = await resetPasswordAction(id);
          if (ok) toast.success(`초기화했어요. ${name} 학생에게 ${password}로 로그인하라고 알려 주세요`);
          else toast.error("초기화하지 못했어요");
        });
      }}
    >
      비밀번호 초기화
    </Button>
  );
}
