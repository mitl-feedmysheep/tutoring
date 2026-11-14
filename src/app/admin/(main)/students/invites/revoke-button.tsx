"use client";

import { useTransition } from "react";
import { askConfirm } from "@/components/confirm-dialog";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { revokeInviteAction } from "@/app/admin/actions";

export function RevokeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!(await askConfirm({ title: "이 링크를 취소할까요?", description: "취소하면 이 링크로 가입할 수 없어요.", confirmLabel: "링크 취소", destructive: true }))) return;
        start(async () => {
          const ok = await revokeInviteAction(id);
          if (ok) toast.success("링크를 취소했어요");
          else toast.error("이미 쓰였거나 만료된 링크예요");
        });
      }}
    >
      취소
    </Button>
  );
}
