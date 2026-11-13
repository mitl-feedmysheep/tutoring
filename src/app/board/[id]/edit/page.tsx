import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { boardCtxOf, getPost } from "@/lib/board/board";
import { SubScreen } from "@/components/app/screens";
import { PostForm } from "@/components/app/board/post-form";

export const metadata: Metadata = { title: "글 고치기" };

// 내가 쓴 글 고치기 (APP-11). 상대방 글이면 없는 화면
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(boardCtxOf((await requireUser()).claims), id);
  if (!post || !post.mine) notFound();

  return (
    <SubScreen title="글 고치기" fallback="/my">
      <PostForm mode="edit" post={{ id: post.id, title: post.title, content: post.content }} />
    </SubScreen>
  );
}
