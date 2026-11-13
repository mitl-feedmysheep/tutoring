import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { boardCtxOf, boardStudent } from "@/lib/board/board";
import { ScheduleError } from "@/lib/schedule/teacher";
import { SubScreen } from "@/components/app/screens";
import { PostForm } from "@/components/app/board/post-form";

export const metadata: Metadata = { title: "글쓰기" };

// 글쓰기 (BOARD-04). 선생님은 ?student=학생 id 로 어느 학생에게 쓰는지 정한다 (서버에서 내 활성 학생인지 다시 확인)
export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const ctx = boardCtxOf((await requireUser()).claims);
  if (ctx.role === "student") {
    return (
      <SubScreen title="글쓰기" fallback="/my">
        <PostForm mode="new" studentId={null} />
      </SubScreen>
    );
  }

  const { student: studentId } = await searchParams;
  let name: string;
  try {
    name = (await boardStudent(ctx, studentId)).name;
  } catch (e) {
    if (e instanceof ScheduleError) notFound();
    throw e;
  }
  return (
    <SubScreen title={`${name}에게 글쓰기`} fallback="/my">
      <PostForm mode="new" studentId={studentId!} />
    </SubScreen>
  );
}
