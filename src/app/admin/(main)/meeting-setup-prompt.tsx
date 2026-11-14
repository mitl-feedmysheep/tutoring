"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";

// MEET-08: 화상 수업을 준비하지 않았으면 일정·학생보다 먼저 하게 한다.
// 화상 수업 화면 말고는 이 창이 화면을 덮고, 닫을 수 없다. 설정을 저장하면 레이아웃이 다시 그려져 사라진다
const MEETING = "/admin/meeting";

export function MeetingSetupPrompt() {
  const pathname = usePathname();
  if (pathname.startsWith(MEETING)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="meeting-setup-title" className="grid w-full max-w-sm gap-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Video className="size-5" />
        </div>
        <div className="grid gap-1.5">
          <h2 id="meeting-setup-title" className="text-lg font-semibold">
            화상 수업을 먼저 준비해 주세요
          </h2>
          <p className="text-sm text-muted-foreground">
            Google Meet을 연결하거나 고정 링크를 넣어야 학생이 수업에 들어올 수 있어요. 준비를 마치면 일정과 학생을 관리할 수 있어요.
          </p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href={MEETING}>화상 수업 설정하기</Link>
        </Button>
      </div>
    </div>
  );
}
