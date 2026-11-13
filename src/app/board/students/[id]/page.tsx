import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { boardCtxOf, listPosts } from "@/lib/board/board";
import { ScheduleError } from "@/lib/schedule/teacher";
import { SubScreen } from "@/components/app/screens";
import { PostList, WriteLink } from "@/components/app/board/post-list";

export const metadata: Metadata = { title: "게시판" };

// 선생님: 한 학생과 주고받은 글 목록 (APP-05). 학생은 자기 게시판으로 보낸다
export default async function StudentBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = boardCtxOf((await requireUser()).claims);
  if (ctx.role === "student") redirect("/board");

  let result;
  try {
    result = await listPosts(ctx, id);
  } catch (e) {
    if (e instanceof ScheduleError) notFound();
    throw e;
  }

  return (
    <SubScreen title={`${result.student.name} 게시판`} fallback="/my" action={<WriteLink href={`/board/new?student=${result.student.id}`} />}>
      <PostList posts={result.posts} otherName={result.student.name} now={new Date()} empty="아직 주고받은 글이 없어요." />
    </SubScreen>
  );
}
