"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { addComment, boardCtxOf, createPost, deleteComment, deletePost, updatePost } from "@/lib/board/board";
import { ScheduleError } from "@/lib/schedule/teacher";
import type { ActionResult } from "./lesson-actions";

// 웹앱 게시판 액션 (학생, 선생님). 누구인지는 서버 세션(requireUser)에서만 정하고, 클라이언트는 글·댓글 id와 내용만 보낸다.
// 선생님이 보내는 학생 id는 그 선생님의 활성 학생인지 board.ts에서 확인한다

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath("/board", "layout");
    return { ok: true, ...value };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

async function ctx() {
  return boardCtxOf((await requireUser()).claims);
}

export async function createPostAction(studentId: string | null, input: { title: string; content: string }) {
  const me = await ctx();
  return run(async () => {
    const post = await createPost(me, studentId, input);
    // TODO(5단계): 상대방에게 알림 (BOARD-02, NOTI-05)
    return { id: post.id };
  });
}

export async function updatePostAction(id: string, input: { title: string; content: string }) {
  const me = await ctx();
  return run(async () => {
    await updatePost(me, id, input);
    return {};
  });
}

export async function deletePostAction(id: string) {
  const me = await ctx();
  return run(async () => {
    await deletePost(me, id);
    return {};
  });
}

export async function addCommentAction(boardId: string, content: string) {
  const me = await ctx();
  return run(async () => {
    await addComment(me, boardId, content);
    // TODO(5단계): 상대방에게 알림 (BOARD-02, NOTI-05)
    return {};
  });
}

export async function deleteCommentAction(id: string) {
  const me = await ctx();
  return run(async () => {
    await deleteComment(me, id);
    return {};
  });
}
