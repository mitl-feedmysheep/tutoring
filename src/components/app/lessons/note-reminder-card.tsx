import Link from "next/link";
import { ChevronRight, PenLine } from "lucide-react";

// 수업 탭 "지난 수업 노트 쓰기" (APP-21). 가장 최근에 끝난 수업의 내 노트가 비어 있을 때만 보인다
export function NoteReminderCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-[0_0_0_1px_var(--color-border)] transition-colors hover:bg-accent/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary">
        <PenLine className="size-4.5" />
      </span>
      <span className="grid min-w-0 flex-1">
        <b className="text-[15px]">지난 수업 노트 쓰기</b>
        <small className="truncate text-[13px] text-muted-foreground tabular-nums">{label} 수업</small>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
