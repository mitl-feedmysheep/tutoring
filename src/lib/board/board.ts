import type { SessionClaims } from "@/lib/auth/token";
import { studentDb, teacherDb, type ScopedDb } from "@/lib/db/scope";
import { ScheduleError } from "@/lib/schedule/teacher";
import { cleanText, COMMENT_MAX, CONTENT_MAX, TITLE_MAX } from "./rules";

// 게시판 (BOARD-01, 02, 04, APP-11, 15). 선생님과 학생 한 명이 1:1로 주고받는다.
// 선생님은 teacherDb로 자기 학생 글을 모두 보고, 학생은 studentDb라 범위 계층이 본인 글만 보여 준다.
// 고치기·지우기는 내가 쓴 것만: 학생은 범위 계층이 author=STUDENT로 막고, 선생님은 여기서 author=TEACHER로 거른다

export type BoardCtx = { db: ScopedDb; role: "teacher" } | { db: ScopedDb; role: "student"; studentId: string };
type Author = "TEACHER" | "STUDENT";

/** 웹앱 로그인 정보로 만든다. 값은 서버 세션에서 나온 것만 */
export function boardCtxOf(claims: SessionClaims): BoardCtx {
  if (claims.role === "student") return { db: studentDb(claims.teacherId, claims.studentId), role: "student", studentId: claims.studentId };
  return { db: teacherDb(claims.teacherId), role: "teacher" };
}

const ID = /^[0-9a-f-]{36}$/;
/** 고친 글 표시: updated_at이 만든 때보다 이만큼 늦으면 고친 글 (만들 때 두 값이 조금 다를 수 있어서) */
const EDIT_GAP_MS = 1000;
const myAuthor = (ctx: BoardCtx): Author => (ctx.role === "teacher" ? "TEACHER" : "STUDENT");

function checkId(id: unknown): string {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("잘못된 요청이에요");
  return id;
}

function text(value: unknown, max: number, label: string, what: string) {
  if (typeof value !== "string") throw new ScheduleError("잘못된 요청이에요");
  const t = cleanText(value);
  if (t === "") throw new ScheduleError(`${label}을 적어 주세요`);
  if (t.length > max) throw new ScheduleError(`${what}은 ${max.toLocaleString()}자까지 쓸 수 있어요`);
  return t;
}

export type PostInput = { title: string; content: string };

function postInput(input: unknown): PostInput {
  const v = (input ?? {}) as Record<string, unknown>;
  return { title: text(v.title, TITLE_MAX, "제목", "제목"), content: text(v.content, CONTENT_MAX, "내용", "내용") };
}

/** 선생님: 그 학생이 내 활성 학생인지. 학생: 본인. 대화 상대 학생 id */
export async function boardStudent(ctx: BoardCtx, studentId: unknown): Promise<{ id: string; name: string }> {
  const id = ctx.role === "student" ? ctx.studentId : checkId(studentId);
  const s = await ctx.db.student.findFirst({ where: { id, deactivatedAt: null }, select: { id: true, name: true } });
  if (!s) throw new ScheduleError("없는 학생이에요");
  return s;
}

/** 글을 볼 수 있는지 (비활성 학생 글은 선생님에게도 숨긴다) */
async function findPost(ctx: BoardCtx, boardId: unknown) {
  const id = checkId(boardId);
  const post = await ctx.db.board.findFirst({
    where: { id, student: { deactivatedAt: null, deletedAt: null } },
    select: { id: true, studentId: true, author: true },
  });
  if (!post) throw new ScheduleError("없는 글이에요");
  return post;
}

// ── 목록

export type StudentThread = { id: string; name: string; posts: number; lastAt: Date | null };

/** APP-05: 선생님 게시판 첫 화면. 활성 학생마다 글 수와 마지막 글·댓글 시각. 최근 것부터, 글 없는 학생은 이름 순으로 뒤에 */
export async function studentThreads(db: ScopedDb): Promise<StudentThread[]> {
  const [students, posts] = await Promise.all([
    db.student.findMany({ where: { deactivatedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.board.findMany({
      where: { student: { deactivatedAt: null, deletedAt: null } },
      select: { studentId: true, createdAt: true, comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    }),
  ]);
  const stats = new Map<string, { posts: number; lastAt: Date }>();
  for (const p of posts) {
    const at = p.comments[0] && p.comments[0].createdAt > p.createdAt ? p.comments[0].createdAt : p.createdAt;
    const s = stats.get(p.studentId);
    if (!s) stats.set(p.studentId, { posts: 1, lastAt: at });
    else {
      s.posts++;
      if (at > s.lastAt) s.lastAt = at;
    }
  }
  return students
    .map((s) => ({ ...s, posts: stats.get(s.id)?.posts ?? 0, lastAt: stats.get(s.id)?.lastAt ?? null }))
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
}

export type PostSummary = { id: string; title: string; author: Author; mine: boolean; createdAt: Date; comments: number; lastAt: Date };

/** 한 학생과의 글 목록. 마지막 글·댓글이 최근인 것부터. 학생은 studentId 없이 본인 것 */
export async function listPosts(ctx: BoardCtx, studentId?: unknown) {
  const student = await boardStudent(ctx, studentId);
  const rows = await ctx.db.board.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      author: true,
      createdAt: true,
      _count: { select: { comments: true } },
      comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const me = myAuthor(ctx);
  const posts: PostSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    mine: r.author === me,
    createdAt: r.createdAt,
    comments: r._count.comments,
    lastAt: r.comments[0] && r.comments[0].createdAt > r.createdAt ? r.comments[0].createdAt : r.createdAt,
  }));
  posts.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return { student, posts };
}

// ── 글 보기

export type CommentView = { id: string; author: Author; mine: boolean; content: string; createdAt: Date };
export type PostView = {
  id: string;
  student: { id: string; name: string };
  author: Author;
  mine: boolean;
  title: string;
  content: string;
  createdAt: Date;
  edited: boolean;
  comments: CommentView[];
};

/** 글과 댓글 (오래된 것부터). 없거나 볼 수 없으면 null */
export async function getPost(ctx: BoardCtx, boardId: string): Promise<PostView | null> {
  if (!ID.test(boardId)) return null;
  const post = await ctx.db.board.findFirst({
    where: { id: boardId, student: { deactivatedAt: null, deletedAt: null } },
    select: {
      id: true,
      author: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      student: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, author: true, content: true, createdAt: true } },
    },
  });
  if (!post) return null;
  const me = myAuthor(ctx);
  return {
    id: post.id,
    student: post.student,
    author: post.author,
    mine: post.author === me,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    edited: post.updatedAt.getTime() - post.createdAt.getTime() > EDIT_GAP_MS,
    comments: post.comments.map((c) => ({ ...c, mine: c.author === me })),
  };
}

// ── 쓰기

/**
 * BOARD-04: 글 쓰기. 선생님은 어느 학생과의 글인지 studentId를 보낸다 (학생은 본인).
 * 돌려주는 receiver는 알림을 받을 상대방 (BOARD-02)
 */
export async function createPost(ctx: BoardCtx, studentId: unknown, input: unknown) {
  const data = postInput(input);
  const student = await boardStudent(ctx, studentId);
  // teacher_id(학생이면 student_id, author도)는 범위 계층이 채운다
  const post = await ctx.db.board.create({ data: { studentId: student.id, author: myAuthor(ctx), ...data } as never, select: { id: true } });
  return { id: post.id, studentId: student.id };
}

/** APP-11: 내가 쓴 글 고치기 */
export async function updatePost(ctx: BoardCtx, boardId: unknown, input: unknown, now = new Date()) {
  const data = postInput(input);
  const post = await findPost(ctx, boardId);
  if (post.author !== myAuthor(ctx)) throw new ScheduleError("내가 쓴 글만 고칠 수 있어요");
  await ctx.db.board.updateMany({ where: { id: post.id, author: myAuthor(ctx) }, data: { ...data, updatedAt: now } });
}

/** APP-11: 내가 쓴 글 지우기. 댓글은 글과 함께 보이지 않게 된다 */
export async function deletePost(ctx: BoardCtx, boardId: unknown, now = new Date()) {
  const post = await findPost(ctx, boardId);
  if (post.author !== myAuthor(ctx)) throw new ScheduleError("내가 쓴 글만 지울 수 있어요");
  await ctx.db.board.updateMany({ where: { id: post.id, author: myAuthor(ctx) }, data: { deletedAt: now } });
}

/** BOARD-04: 댓글 달기 */
export async function addComment(ctx: BoardCtx, boardId: unknown, content: unknown) {
  const body = text(content, COMMENT_MAX, "댓글", "댓글");
  const post = await findPost(ctx, boardId);
  // 학생이면 범위 계층이 글이 본인 것인지 한 번 더 확인한다
  const comment = await ctx.db.comment.create({ data: { boardId: post.id, author: myAuthor(ctx), content: body } as never, select: { id: true } });
  return { id: comment.id, boardId: post.id, studentId: post.studentId };
}

/** 내가 쓴 댓글 지우기 */
export async function deleteComment(ctx: BoardCtx, commentId: unknown, now = new Date()) {
  const id = checkId(commentId);
  const comment = await ctx.db.comment.findFirst({ where: { id, author: myAuthor(ctx) }, select: { id: true, boardId: true } });
  if (!comment) throw new ScheduleError("없는 댓글이에요");
  await findPost(ctx, comment.boardId);
  await ctx.db.comment.updateMany({ where: { id: comment.id, author: myAuthor(ctx) }, data: { deletedAt: now } });
  return { boardId: comment.boardId };
}
