"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { setMaterialDescriptionAction } from "@/app/admin/file-actions";
import { DESCRIPTION_MAX } from "@/lib/files/rules";

// FILE-05: 공개한 학생에게 자료와 함께 보이는 설명 (참고 링크, 공부 방법 등)
export function DescriptionEditor({ fileId, saved }: { fileId: string; saved: string }) {
  const [text, setText] = useState(saved);
  const [pending, start] = useTransition();
  const changed = text.trim() !== saved;

  const save = () =>
    start(async () => {
      const res = await setMaterialDescriptionAction(fileId, text);
      if (!res.ok) return void toast.error(res.error);
      toast.success(text.trim() ? "설명을 저장했어요" : "설명을 지웠어요");
    });

  return (
    <div className="grid gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        rows={4}
        placeholder={"학생에게 같이 보여 줄 설명이나 참고 링크를 적어요\n예: 3과까지 읽고 오세요. 발음 참고 https://..."}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">https:// 로 시작하는 주소는 학생 화면에서 눌러서 열 수 있어요.</span>
        <Button type="button" disabled={!changed || pending} onClick={save} className="shrink-0">
          {pending ? "저장하는 중..." : "설명 저장"}
        </Button>
      </div>
    </div>
  );
}
