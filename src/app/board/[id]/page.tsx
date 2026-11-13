import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { boardCtxOf, getPost } from "@/lib/board/board";
import { commentTimeText, fullTimeText } from "@/lib/board/format";
import { SubScreen } from "@/components/app/screens";
import { PostMenu } from "@/components/app/board/post-menu";
import { Comments } from "@/components/app/board/comments";

export const metadata: Metadata = { title: "게시판" };

// 글 보기 (BOARD-04, APP-11, 15). 위에 글, 아래 댓글 대화와 댓글 칸. 알림으로 바로 들어오면 ← 는 MY 탭으로 (APP-08)
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = boardCtxOf((await requireUser()).claims);
  const post = await getPost(ctx, id);
  if (!post) notFound();

  const now = new Date();
  const otherName = ctx.role === "student" ? "선생님" : post.student.name;
  const list = ctx.role === "student" ? "/board" : `/board/students/${post.student.id}`;

  return (
    <SubScreen title={ctx.role === "student" ? "게시판" : `${post.student.name} 게시판`} fallback="/my">
      <article className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_var(--color-border)]">
        <h2 className="text-lg leading-snug font-bold break-words">{post.title}</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {post.mine ? "나" : otherName} · {fullTimeText(post.createdAt, now)}
            {post.edited && " · 고침"}
          </p>
          {post.mine && <PostMenu postId={post.id} back={list} />}
        </div>
        <p className="border-t border-border pt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
      </article>

      <Comments
        postId={post.id}
        otherName={otherName}
        comments={post.comments.map((c) => ({
          id: c.id,
          mine: c.mine,
          content: c.content,
          time: commentTimeText(c.createdAt, now),
        }))}
      />
    </SubScreen>
  );
}

