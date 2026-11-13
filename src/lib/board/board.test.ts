import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ScheduleError } from "@/lib/schedule/teacher";
import { addComment, boardCtxOf, createPost, deleteComment, deletePost, getPost, listPosts, studentThreads, updatePost } from "./board";

afterAll(() => prisma.$disconnect());

const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));
const POST = { title: "질문 있어요", content: "현재완료는\n언제 써요?" };

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `tb-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string, name = "S") {
  return prisma.student.create({
    data: { teacherId, name, birthYear: 1990, gender: "FEMALE", email: `sb-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

async function setup() {
  const t = await newTeacher();
  const s = await newStudent(t.id);
  const teacher = boardCtxOf({ role: "teacher", teacherId: t.id, v: 1 });
  const student = boardCtxOf({ role: "student", teacherId: t.id, studentId: s.id, v: 1 });
  return { t, s, teacher, student };
}

describe("글 쓰기와 보기", () => {
  it("학생과 선생님이 서로의 글을 보고 댓글로 주고받는다", async () => {
    const { s, teacher, student } = await setup();
    const { id } = await createPost(student, undefined, { title: " 질문 있어요 ", content: "현재완료는\r\n언제 써요?\n" });
    await addComment(teacher, id, "경험을 말할 때요");
    await addComment(student, id, "감사합니다!");

    const seen = await getPost(student, id);
    expect(seen).toMatchObject({ title: "질문 있어요", content: "현재완료는\n언제 써요?", author: "STUDENT", mine: true, edited: false });
    expect(seen!.comments.map((c) => [c.author, c.mine, c.content])).toEqual([
      ["TEACHER", false, "경험을 말할 때요"],
      ["STUDENT", true, "감사합니다!"],
    ]);
    expect((await getPost(teacher, id))!.mine).toBe(false);

    const t = await createPost(teacher, s.id, POST);
    const list = await listPosts(student);
    expect(list.posts.map((p) => [p.id, p.author, p.mine])).toEqual([
      [t.id, "TEACHER", false],
      [id, "STUDENT", true],
    ]);
    expect(list.posts[1].comments).toBe(2);
  });

  it("빈 제목·내용, 너무 긴 글은 거절한다", async () => {
    const { student } = await setup();
    await err(createPost(student, undefined, { title: "  ", content: "x" }), "제목을 적어 주세요");
    await err(createPost(student, undefined, { title: "x", content: "\n " }), "내용을 적어 주세요");
    await err(createPost(student, undefined, { title: "x".repeat(101), content: "x" }), "제목은 100자까지 쓸 수 있어요");
    await err(createPost(student, undefined, { title: "x", content: 3 }), "잘못된 요청이에요");
  });

  it("선생님은 학생 목록에서 최근 글·댓글이 있는 학생부터 본다", async () => {
    const { t, s, teacher } = await setup();
    const quiet = await newStudent(t.id, "가나");
    const other = await newStudent(t.id, "다라");
    const a = await createPost(teacher, s.id, POST);
    await createPost(teacher, other.id, POST);
    await addComment(teacher, a.id, "나중 댓글");

    const threads = await studentThreads(teacher.db);
    expect(threads.map((x) => [x.id, x.posts])).toEqual([
      [s.id, 1],
      [other.id, 1],
      [quiet.id, 0],
    ]);
  });
});

describe("내 것만 고치고 지운다 (APP-11)", () => {
  it("글을 고치면 고친 글로 표시하고, 상대 글은 고치지 못한다", async () => {
    const { s, teacher, student } = await setup();
    const mine = await createPost(student, undefined, POST);
    const theirs = await createPost(teacher, s.id, POST);
    await updatePost(student, mine.id, { title: "고친 제목", content: "고친 내용" }, new Date(Date.now() + 5000));
    expect(await getPost(student, mine.id)).toMatchObject({ title: "고친 제목", content: "고친 내용", edited: true });

    await err(updatePost(student, theirs.id, POST), "내가 쓴 글만 고칠 수 있어요");
    await err(updatePost(teacher, mine.id, POST), "내가 쓴 글만 고칠 수 있어요");
    await err(deletePost(teacher, mine.id), "내가 쓴 글만 지울 수 있어요");
    await err(deletePost(student, theirs.id), "내가 쓴 글만 지울 수 있어요");
  });

  it("글을 지우면 목록과 보기에서 사라지고 댓글도 달 수 없다", async () => {
    const { student } = await setup();
    const { id } = await createPost(student, undefined, POST);
    await deletePost(student, id);
    expect(await getPost(student, id)).toBeNull();
    expect((await listPosts(student)).posts).toEqual([]);
    await err(addComment(student, id, "x"), "없는 글이에요");
    expect(await prisma.board.count({ where: { id, deletedAt: { not: null } } })).toBe(1); // 소프트 삭제
  });

  it("댓글은 내 것만 지운다", async () => {
    const { s, teacher, student } = await setup();
    const { id } = await createPost(teacher, s.id, POST);
    await addComment(teacher, id, "선생님 댓글");
    await addComment(student, id, "학생 댓글");
    const [tc, sc] = (await getPost(teacher, id))!.comments;

    await err(deleteComment(student, tc.id), "없는 댓글이에요");
    await err(deleteComment(teacher, sc.id), "없는 댓글이에요");
    await deleteComment(student, sc.id);
    expect((await getPost(teacher, id))!.comments.map((c) => c.id)).toEqual([tc.id]);
  });
});

describe("1:1 격리 (BOARD-01)", () => {
  it("같은 선생님의 다른 학생 글은 보지도, 댓글을 달지도 못한다", async () => {
    const { t, teacher, student } = await setup();
    const other = await newStudent(t.id);
    const { id } = await createPost(teacher, other.id, POST);
    expect(await getPost(student, id)).toBeNull();
    await err(addComment(student, id, "x"), "없는 글이에요");
    // 학생이 다른 학생 id를 보내도 본인 게시판에 쓴다
    const mine = await createPost(student, other.id, POST);
    expect((await getPost(teacher, mine.id))!.student.id).not.toBe(other.id);
  });

  it("다른 선생님은 글·학생 목록에 접근하지 못한다", async () => {
    const { s, student } = await setup();
    const { id } = await createPost(student, undefined, POST);
    const t2 = await newTeacher();
    const stranger = boardCtxOf({ role: "teacher", teacherId: t2.id, v: 1 });

    expect(await getPost(stranger, id)).toBeNull();
    await err(listPosts(stranger, s.id), "없는 학생이에요");
    await err(createPost(stranger, s.id, POST), "없는 학생이에요");
    await err(addComment(stranger, id, "x"), "없는 글이에요");
    await err(updatePost(stranger, id, POST), "없는 글이에요");
    await err(deletePost(stranger, id), "없는 글이에요");
    expect(await studentThreads(stranger.db)).toEqual([]);
  });

  it("비활성 학생 글은 선생님에게도 숨기고 새 글도 막는다", async () => {
    const { s, teacher } = await setup();
    const { id } = await createPost(teacher, s.id, POST);
    await prisma.student.update({ where: { id: s.id }, data: { deactivatedAt: new Date() } });
    expect(await getPost(teacher, id)).toBeNull();
    await err(createPost(teacher, s.id, POST), "없는 학생이에요");
    expect(await studentThreads(teacher.db)).toEqual([]);
  });
});
