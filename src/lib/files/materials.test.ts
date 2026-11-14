import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { ScheduleError } from "@/lib/schedule/teacher";
import { inlineName, type Storage } from "@/lib/storage/r2";
import {
  cleanFileName,
  deleteMaterial,
  listMaterials,
  materialDetail,
  materialViewUrl,
  myMaterials,
  prepareMaterialUpload,
  saveMaterial,
  setMaterialAccess,
  updateMaterial,
  materialAccessBoard,
} from "./materials";
import { MATERIAL_MAX_BYTES, PDF_TYPE } from "./rules";

afterAll(() => prisma.$disconnect());

const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

/** 가짜 R2. upload()로 올린 것처럼 만든다 */
function fakeStorage() {
  const objects = new Map<string, { size: number; contentType: string }>();
  const urls: string[] = [];
  const storage: Storage = {
    uploadUrl: async (key) => {
      urls.push(key);
      return `https://upload/${key}`;
    },
    viewUrl: async (key, name) => `https://view/${key}?name=${name}`,
    head: async (key) => objects.get(key) ?? null,
  };
  return { storage, upload: (size = 1000, contentType = PDF_TYPE) => urls.splice(0).forEach((k) => objects.set(k, { size, contentType })) };
}

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `tm-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string, name = "S") {
  return prisma.student.create({
    data: { teacherId, name, birthYear: 1990, gender: "FEMALE", email: `sm-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

async function setup() {
  const t = await newTeacher();
  const a = await newStudent(t.id, "가");
  const b = await newStudent(t.id, "나");
  const fake = fakeStorage();
  const db = teacherDb(t.id);
  const upload = async (name = "Unit 1.pdf") => {
    const { token } = await prepareMaterialUpload(t.id, 1000, fake.storage);
    fake.upload();
    return (await saveMaterial(db, t.id, { token, title: name }, fake.storage)).id;
  };
  return { t, a, b, db, fake, upload, adb: studentDb(t.id, a.id), bdb: studentDb(t.id, b.id) };
}

describe("올리기 (FILE-01)", () => {
  it("올린 PDF를 자료로 저장한다. 처음엔 아무에게도 공개되지 않는다", async () => {
    const { db, adb, upload } = await setup();
    const id = await upload("C:\\자료\\Unit 1.pdf");
    expect(await listMaterials(db)).toMatchObject([{ id, fileName: "Unit 1.pdf", sizeBytes: 1000, shared: 0 }]);
    expect(await myMaterials(adb)).toEqual([]);
    expect(await materialViewUrl(adb, id)).toBeNull();
  });

  it("올리지 않았거나 PDF가 아니거나 너무 큰 파일, 남의 표는 거절한다", async () => {
    const { t, db, fake } = await setup();
    const p1 = await prepareMaterialUpload(t.id, 1000, fake.storage);
    await err(saveMaterial(db, t.id, { token: p1.token, title: "a.pdf" }, fake.storage), "PDF를 올리지 못했어요. 다시 올려 주세요");
    fake.upload(1000, "image/png");
    await err(saveMaterial(db, t.id, { token: p1.token, title: "a.pdf" }, fake.storage), "올릴 수 없는 파일이에요");

    await err(prepareMaterialUpload(t.id, MATERIAL_MAX_BYTES + 1, fake.storage), "PDF는 50MB까지 올릴 수 있어요");
    const p2 = await prepareMaterialUpload(t.id, 1000, fake.storage);
    fake.upload(MATERIAL_MAX_BYTES + 1);
    await err(saveMaterial(db, t.id, { token: p2.token, title: "a.pdf" }, fake.storage), "올릴 수 없는 파일이에요");

    // 다른 선생님 표, 고친 표, 같은 표 두 번
    const t2 = await newTeacher();
    const p3 = await prepareMaterialUpload(t2.id, 1000, fake.storage);
    fake.upload();
    await err(saveMaterial(db, t.id, { token: p3.token, title: "a.pdf" }, fake.storage), "PDF를 다시 올려 주세요");
    await err(saveMaterial(db, t.id, { token: p3.token + "x", title: "a.pdf" }, fake.storage), "PDF를 다시 올려 주세요");
    await saveMaterial(teacherDb(t2.id), t2.id, { token: p3.token, title: "a.pdf" }, fake.storage);
    await err(saveMaterial(teacherDb(t2.id), t2.id, { token: p3.token, title: "a.pdf" }, fake.storage), "이미 저장한 자료예요. 화면을 새로 고쳐 주세요");
  });

  it("파일 이름을 정리한다", () => {
    expect(cleanFileName("  ")).toBe("자료.pdf");
    expect(cleanFileName("a/b/c.pdf")).toBe("c.pdf");
    const long = cleanFileName("가".repeat(300) + ".pdf");
    expect(long).toHaveLength(200);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("한글 이름도 화면에 바로 여는 헤더로 만든다", () => {
    expect(inlineName("수업 (1).pdf")).toBe(`inline; filename="__ (1).pdf"; filename*=UTF-8''%EC%88%98%EC%97%85%20%281%29.pdf`);
  });
});

describe("학생별 공개 (FILE-03)", () => {
  it("여러 명에게 한 번에 공개하고, 거두고, 다시 공개한다", async () => {
    const { a, b, db, adb, bdb, fake, upload } = await setup();
    const id = await upload();
    await setMaterialAccess(db, id, [a.id, b.id]);
    expect((await listMaterials(db))[0].shared).toBe(2);
    expect(await myMaterials(adb)).toMatchObject([{ id, fileName: "Unit 1.pdf" }]);
    expect(await materialViewUrl(bdb, id, fake.storage)).toContain(`/MATERIAL/${id}.pdf`);

    await setMaterialAccess(db, id, [a.id]);
    expect(await myMaterials(bdb)).toEqual([]);
    expect(await materialViewUrl(bdb, id, fake.storage)).toBeNull();

    await setMaterialAccess(db, id, [a.id, b.id]);
    expect(await myMaterials(bdb)).toHaveLength(1);
    expect(await prisma.fileAccess.count({ where: { fileId: id } })).toBe(2); // 같은 행을 되살림

    const detail = await materialDetail(db, id);
    expect(detail!.students.map((s) => [s.name, s.sharedAt !== null])).toEqual([
      ["가", true],
      ["나", true],
    ]);
  });

  it("비활성 학생은 공개 목록에 없고, 지정할 수 없고, 그 학생 공개는 건드리지 않는다", async () => {
    const { a, b, db, upload } = await setup();
    const id = await upload();
    await setMaterialAccess(db, id, [a.id, b.id]);
    await prisma.student.update({ where: { id: b.id }, data: { deactivatedAt: new Date() } });
    expect((await listMaterials(db))[0].shared).toBe(1);
    await err(setMaterialAccess(db, id, [b.id]), "없는 학생이에요");
    await setMaterialAccess(db, id, []);
    expect(await prisma.fileAccess.count({ where: { fileId: id, deletedAt: null } })).toBe(1); // b 것은 남음
  });

  it("지운 자료는 학생에게서도 사라진다", async () => {
    const { a, db, adb, upload } = await setup();
    const id = await upload();
    await setMaterialAccess(db, id, [a.id]);
    await deleteMaterial(db, id);
    expect(await listMaterials(db)).toEqual([]);
    expect(await myMaterials(adb)).toEqual([]);
    expect(await materialViewUrl(adb, id)).toBeNull();
    await err(setMaterialAccess(db, id, [a.id]), "없는 자료예요");
    await err(deleteMaterial(db, id), "없는 자료예요");
  });
});

describe("설명 (FILE-05)", () => {
  it("설명을 쓰고 고치고 지운다. 공개한 학생에게 같이 보인다. 2,000자까지", async () => {
    const { a, db, adb, upload } = await setup();
    const id = await upload();
    await updateMaterial(db, id, { title: "Unit 1", description: "  3과까지 읽고 오세요\r\n참고 https://example.com  " });
    expect((await materialDetail(db, id))!.file.description).toBe("3과까지 읽고 오세요\n참고 https://example.com");
    expect((await listMaterials(db))[0].description).toBe("3과까지 읽고 오세요\n참고 https://example.com");

    await setMaterialAccess(db, id, [a.id]);
    expect(await myMaterials(adb)).toMatchObject([{ id, description: "3과까지 읽고 오세요\n참고 https://example.com" }]);

    await updateMaterial(db, id, { title: "Unit 1", description: "   " });
    expect((await materialDetail(db, id))!.file.description).toBeNull();

    await err(updateMaterial(db, id, { title: "Unit 1", description: "x".repeat(2001) }), "설명은 2,000자까지 쓸 수 있어요");
    await err(updateMaterial(db, id, { title: "Unit 1", description: 1 }), "잘못된 요청이에요");
  });

  it("다른 선생님과 학생은 설명을 고치지 못한다", async () => {
    const { adb, db, upload } = await setup();
    const id = await upload();
    await updateMaterial(db, id, { title: "원래 제목", description: "원래 설명" });
    const t2 = await newTeacher();
    await err(updateMaterial(teacherDb(t2.id), id, { title: "바꿈", description: "바꿈" }), "없는 자료예요");
    await expect(updateMaterial(adb, id, { title: "바꿈", description: "바꿈" })).rejects.toThrow();
    expect((await materialDetail(db, id))!.file).toMatchObject({ fileName: "원래 제목", description: "원래 설명" });
  });
});

describe("제목·설명을 올릴 때 같이 (FILE-05)", () => {
  it("올리면서 제목과 설명을 저장하고, 제목을 고친다. 열 때는 .pdf 이름으로 받는다", async () => {
    const { t, db, fake } = await setup();
    const { token } = await prepareMaterialUpload(t.id, 1000, fake.storage);
    fake.upload();
    const { id } = await saveMaterial(db, t.id, { token, title: "  Unit 2 듣기  ", description: "- 2번 트랙까지\n" }, fake.storage);
    expect((await materialDetail(db, id))!.file).toMatchObject({ fileName: "Unit 2 듣기", description: "- 2번 트랙까지" });
    await updateMaterial(db, id, { title: "Unit 2", description: "" });
    expect((await materialDetail(db, id))!.file).toMatchObject({ fileName: "Unit 2", description: null });
    expect(await materialViewUrl(db, id, fake.storage)).toContain("Unit 2.pdf");
  });

  it("공유 창: 활성 학생과 자료마다 공개한 학생. 다른 선생님 것은 안 보인다", async () => {
    const { a, b, db, upload } = await setup();
    const id = await upload();
    await setMaterialAccess(db, id, [b.id]);
    const board = await materialAccessBoard(db);
    expect(board.students.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(Object.keys(board.shared[id])).toEqual([b.id]);
    const t2 = await newTeacher();
    expect(await materialAccessBoard(teacherDb(t2.id))).toEqual({ students: [], shared: {} });
  });
});

describe("격리", () => {
  it("다른 선생님은 자료를 보거나 공개·지우지 못하고, 자기 학생에게도 공개할 수 없다", async () => {
    const { a, upload } = await setup();
    const id = await upload();
    const t2 = await newTeacher();
    const s2 = await newStudent(t2.id);
    const db2 = teacherDb(t2.id);
    expect(await listMaterials(db2)).toEqual([]);
    expect(await materialDetail(db2, id)).toBeNull();
    expect(await materialViewUrl(db2, id)).toBeNull();
    await err(setMaterialAccess(db2, id, [s2.id]), "없는 자료예요");
    await err(deleteMaterial(db2, id), "없는 자료예요");
    // 내 자료를 다른 선생님 학생에게 공개할 수 없다
    await err(setMaterialAccess(teacherDb((await prisma.student.findUniqueOrThrow({ where: { id: a.id } })).teacherId), id, [s2.id]), "없는 학생이에요");
  });

  it("학생은 자료를 공개·지우지 못한다", async () => {
    const { a, adb, upload } = await setup();
    const id = await upload();
    await expect(setMaterialAccess(adb, id, [a.id])).rejects.toThrow();
    await expect(deleteMaterial(adb, id)).rejects.toThrow();
    expect(await myMaterials(adb)).toEqual([]);
  });
});
