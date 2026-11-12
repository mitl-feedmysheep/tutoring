"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeInviteAction } from "@/app/admin/actions";

export function RevokeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 링크를 취소할까요? 취소하면 이 링크로 가입할 수 없어요.")) return;
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
