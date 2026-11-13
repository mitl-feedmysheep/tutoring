import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { PostSummary } from "@/lib/board/board";
import { listTimeText } from "@/lib/board/format";
import { Card, Empty } from "@/components/app/ui";

// 한 학생과 주고받은 글 목록 (학생 게시판, 선생님의 학생별 게시판). otherName: 상대방 이름
export function PostList({ posts, otherName, now, empty }: { posts: PostSummary[]; otherName: string; now: Date; empty: string }) {
  if (posts.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Card>
      {posts.map((p) => (
        <Link key={p.id} href={`/board/${p.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/50">
          <span className="truncate text-[15px] font-semibold">{p.title}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{p.mine ? "나" : otherName}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{listTimeText(p.lastAt, now)}</span>
            {p.comments > 0 && (
              <span className="ml-auto flex items-center gap-1 font-semibold text-primary tabular-nums">
                <MessageCircle className="size-3.5" aria-label="댓글" />
                {p.comments}
              </span>
            )}
          </span>
        </Link>
      ))}
    </Card>
  );
}

/** 오른쪽 위 글쓰기 버튼 */
export function WriteLink({ href }: { href: string }) {
  return (
    <Link href={href} className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-bold text-primary">
      + 글쓰기
    </Link>
  );
}
