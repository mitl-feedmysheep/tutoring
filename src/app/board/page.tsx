import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { boardCtxOf, listPosts, studentThreads } from "@/lib/board/board";
import { listTimeText } from "@/lib/board/format";
import { SubScreen } from "@/components/app/screens";
import { Card, Empty, Rule } from "@/components/app/ui";
import { PostList, WriteLink } from "@/components/app/board/post-list";

export const metadata: Metadata = { title: "게시판" };

// MY > 게시판 (BOARD-01, APP-04, 05). 학생은 선생님과 주고받은 글 목록, 선생님은 학생별 목록
export default async function BoardPage() {
  const ctx = boardCtxOf((await requireUser()).claims);
  const now = new Date();

  if (ctx.role === "student") {
    const { posts } = await listPosts(ctx);
    return (
      <SubScreen title="게시판" fallback="/my" action={<WriteLink href="/board/new" />}>
        <Rule>선생님과 나만 보는 게시판이에요. 질문이나 수업 후기를 남겨 주세요.</Rule>
        <PostList posts={posts} otherName="선생님" now={now} empty="아직 글이 없어요." />
      </SubScreen>
    );
  }

  const threads = await studentThreads(ctx.db);
  return (
    <SubScreen title="게시판" fallback="/my">
      {threads.length === 0 ? (
        <Empty>아직 학생이 없어요.</Empty>
      ) : (
        <Card>
          {threads.map((t) => (
            <Link key={t.id} href={`/board/students/${t.id}`} className="flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50">
              <span className="min-w-0 flex-1 truncate text-[15px]">{t.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t.lastAt ? `글 ${t.posts} · ${listTimeText(t.lastAt, now)}` : "글 없음"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      )}
    </SubScreen>
  );
}
