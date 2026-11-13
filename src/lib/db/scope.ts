/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma 쿼리 인자를 모델 구분 없이 다룬다 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./client";

// 선생님·학생 범위를 강제하는 DB 계층.
// 기능 코드는 세션에서 꺼낸 값으로 teacherDb(teacherId) 또는 studentDb(teacherId, studentId)를 만들어 쓴다.
//
// 자동으로 하는 일
// - 모든 조회·수정 조건에 범위(teacher_id, 학생이면 본인 것)와 deleted_at IS NULL을 붙인다
// - include/select로 딸려오는 목록에도 같은 조건을 붙인다
// - 만들 때 teacher_id(학생이면 student_id, author 등)를 채운다. 다른 값을 넣으면 오류
// - delete는 막는다. 소프트 삭제는 update로 deletedAt을 넣는다
// - 지운 행 되살리기: update/updateMany의 최상위 where에 deletedAt 조건을 직접 쓰면 그 조건을 따른다 (범위 조건은 그대로)
// - 관계 필드로 중첩 쓰기(create/connect 등)는 막는다. 범위 검사를 우회할 수 있어서
//
// 직접 챙겨야 하는 것
// - where 안의 관계 조건(some/every/is)에는 deletedAt: null을 직접 넣는다
// - $queryRaw 같은 SQL 직접 실행은 쓰지 않는다

type Model = Prisma.ModelName;
type Where = Record<string, any>;

export type Scope =
  | { kind: "teacher"; teacherId: string }
  | { kind: "student"; teacherId: string; studentId: string; byTeacher?: boolean };

/** 모델별 관계. many = 목록, one = 단건. 스키마에 관계를 추가하면 여기도 추가한다 (테스트가 확인) */
export const RELATIONS: Record<Model, { many: Record<string, Model>; one: Record<string, Model> }> = {
  Teacher: {
    many: { students: "Student", invites: "Invite", weeklySlots: "WeeklySlot", slots: "Slot", studyLogs: "StudyLog", files: "File", monthlySlotHistories: "MonthlySlotHistory", pushSubscriptions: "PushSubscription" },
    one: {},
  },
  Student: {
    many: {
      invites: "Invite",
      weeklyLessons: "WeeklyLesson",
      lessons: "Lesson",
      scheduleChanges: "ScheduleChange",
      studyLogs: "StudyLog",
      uploadedFiles: "File",
      fileAccesses: "FileAccess",
      payments: "Payment",
      boards: "Board",
      pushSubscriptions: "PushSubscription",
    },
    one: { teacher: "Teacher" },
  },
  Invite: { many: {}, one: { teacher: "Teacher", student: "Student" } },
  WeeklySlot: { many: { slots: "Slot", weeklyLessons: "WeeklyLesson" }, one: { teacher: "Teacher" } },
  Slot: { many: { lessons: "Lesson" }, one: { teacher: "Teacher", weeklySlot: "WeeklySlot" } },
  MonthlySlotHistory: { many: {}, one: { teacher: "Teacher" } },
  WeeklyLesson: {
    many: { lessons: "Lesson", scheduleChanges: "ScheduleChange" },
    one: { student: "Student", weeklySlot: "WeeklySlot" },
  },
  Lesson: {
    many: { notes: "LessonNote", scheduleChanges: "ScheduleChange" },
    one: { slot: "Slot", student: "Student", weeklyLesson: "WeeklyLesson" },
  },
  ScheduleChange: { many: {}, one: { student: "Student", lesson: "Lesson", weeklyLesson: "WeeklyLesson" } },
  LessonNote: { many: {}, one: { lesson: "Lesson" } },
  StudyLog: { many: { photos: "File" }, one: { teacher: "Teacher", student: "Student" } },
  File: { many: { accesses: "FileAccess" }, one: { teacher: "Teacher", uploaderStudent: "Student", studyLog: "StudyLog" } },
  FileAccess: { many: {}, one: { file: "File", student: "Student" } },
  Payment: { many: {}, one: { student: "Student" } },
  Board: { many: { comments: "Comment" }, one: { student: "Student" } },
  Comment: { many: {}, one: { board: "Board" } },
  PushSubscription: { many: {}, one: { teacher: "Teacher", student: "Student" } },
};

/** student_id 컬럼이 있는 모델 */
const HAS_STUDENT_ID = new Set<Model>(["Invite", "WeeklyLesson", "Lesson", "ScheduleChange", "StudyLog", "FileAccess", "Payment", "Board", "PushSubscription"]);

/** 학생이 쓰기(만들기·수정)할 수 있는 모델. 나머지는 학생 범위에서 쓰기 금지 */
const STUDENT_WRITABLE = new Set<Model>(["Student", "WeeklyLesson", "Lesson", "ScheduleChange", "LessonNote", "StudyLog", "File", "Board", "Comment", "PushSubscription"]);

/** 선생님이 학생 일정을 대신 바꿀 때(byTeacher) 쓰기할 수 있는 모델. 노트·글처럼 작성자가 학생으로 남는 것은 막는다 */
const TEACHER_FOR_STUDENT_WRITABLE = new Set<Model>(["Student", "WeeklyLesson", "Lesson", "ScheduleChange"]);

function canStudentWrite(model: Model, scope: Scope) {
  if (scope.kind !== "student") return true;
  return (scope.byTeacher ? TEACHER_FOR_STUDENT_WRITABLE : STUDENT_WRITABLE).has(model);
}

const NONE: Where = { id: { in: [] } };

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

/** 이 범위에서 볼 수 있는 행 */
export function readFilter(model: Model, scope: Scope): Where {
  const base: Where = model === "Teacher" ? { id: scope.teacherId } : { teacherId: scope.teacherId };
  base.deletedAt = null;
  if (scope.kind === "teacher") return base;

  const sid = scope.studentId;
  switch (model) {
    case "Teacher":
    case "WeeklySlot":
    case "Slot":
      return base; // 같은 선생님 학생들이 함께 보는 것
    case "Student":
      return { ...base, id: sid };
    case "Invite":
    case "MonthlySlotHistory":
      return NONE;
    case "StudyLog": // student_id NULL(선생님 본인 기록)은 빠진다
    case "WeeklyLesson":
    case "Lesson":
    case "ScheduleChange":
    case "FileAccess":
    case "Payment":
    case "Board":
    case "PushSubscription": // 학생은 본인 기기만. student_id NULL(선생님 기기)은 빠진다
      return { ...base, studentId: sid };
    case "LessonNote": // 학생은 선생님 노트를 못 본다
      return { ...base, author: "STUDENT", lesson: { studentId: sid } };
    case "Comment":
      return { ...base, board: { studentId: sid } };
    case "File": // 본인이 올린 사진, 또는 본인에게 공개된 자료
      return {
        ...base,
        OR: [{ uploaderStudentId: sid }, { kind: "MATERIAL", accesses: { some: { studentId: sid, deletedAt: null } } }],
      };
  }
}

/** 이 범위에서 수정할 수 있는 행 */
function writeFilter(model: Model, scope: Scope): Where {
  if (scope.kind === "teacher") return readFilter(model, scope);
  if (!canStudentWrite(model, scope)) throw new ScopeError(`학생은 ${model}을(를) 수정할 수 없습니다`);
  const base: Where = { teacherId: scope.teacherId, deletedAt: null };
  const sid = scope.studentId;
  switch (model) {
    case "Student":
      return { ...base, id: sid };
    case "File":
      return { ...base, uploaderStudentId: sid };
    case "LessonNote":
      return { ...base, author: "STUDENT", lesson: { studentId: sid } };
    case "Comment":
      return { ...base, author: "STUDENT", board: { studentId: sid } };
    case "Board":
      return { ...base, author: "STUDENT", studentId: sid };
    default:
      return { ...base, studentId: sid };
  }
}

/** 만들 때 강제로 채우는 값 */
function forcedFields(model: Model, scope: Scope): Where {
  if (model === "Teacher") throw new ScopeError("선생님 계정은 범위 안에서 만들 수 없습니다");
  const fields: Where = { teacherId: scope.teacherId };
  if (scope.kind === "teacher") return fields;

  if (model === "Student" || !canStudentWrite(model, scope)) throw new ScopeError(`학생은 ${model}을(를) 만들 수 없습니다`);
  if (HAS_STUDENT_ID.has(model)) fields.studentId = scope.studentId;
  if (model === "LessonNote" || model === "Board" || model === "Comment") fields.author = "STUDENT";
  if (model === "ScheduleChange") fields.changedBy = scope.byTeacher ? "TEACHER" : "STUDENT";
  if (model === "File") Object.assign(fields, { uploaderStudentId: scope.studentId, kind: "STUDY_PHOTO" });
  return fields;
}

/** 학생이 만들 때 연결하는 부모가 본인 것인지 */
const STUDENT_PARENTS: Partial<Record<Model, { field: string; model: Model }[]>> = {
  LessonNote: [{ field: "lessonId", model: "Lesson" }],
  Comment: [{ field: "boardId", model: "Board" }],
  File: [{ field: "studyLogId", model: "StudyLog" }],
  Lesson: [{ field: "weeklyLessonId", model: "WeeklyLesson" }],
  ScheduleChange: [
    { field: "lessonId", model: "Lesson" },
    { field: "weeklyLessonId", model: "WeeklyLesson" },
  ],
};

/**
 * created: 이 학생 범위로 직접 만든 행("Lesson:id"). 만들 때 student_id를 강제했으니 본인 것이다.
 * 부모 확인은 트랜잭션 밖 연결로 하므로, 같은 트랜잭션에서 방금 만든 부모는 여기로 확인한다
 */
async function checkStudentParents(model: Model, data: Where, scope: Scope, created?: Set<string>) {
  if (scope.kind !== "student") return;
  for (const { field, model: parent } of STUDENT_PARENTS[model] ?? []) {
    const id = data[field];
    if (id == null) continue;
    if (created?.has(`${parent}:${id}`)) continue;
    const delegate = (prisma as any)[lowerFirst(parent)];
    const found = await delegate.count({ where: { id, ...readFilter(parent, scope) } });
    if (!found) throw new ScopeError(`${model}.${field}가 본인 것이 아닙니다`);
  }
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function and(a: Where | undefined, b: Where): Where {
  return a ? { AND: [a, b] } : b;
}

/** 최상위 where에 범위를 붙인다. findUnique의 고유 키가 그대로 남도록 AND에 추가한다 */
function scopeWhere(where: Where | undefined, filter: Where): Where {
  const w = where ?? {};
  const existing = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  return { ...w, AND: [...existing, filter] };
}

function relationNames(model: Model) {
  return new Set([...Object.keys(RELATIONS[model].many), ...Object.keys(RELATIONS[model].one)]);
}

function forbidNestedWrites(model: Model, data: Where) {
  const rel = relationNames(model);
  for (const key of Object.keys(data)) {
    if (rel.has(key)) throw new ScopeError(`${model}.${key}: 관계 필드로 중첩 쓰기는 할 수 없습니다. id 값으로 연결하세요`);
  }
}

function applyForced(model: Model, data: Where, forced: Where): Where {
  forbidNestedWrites(model, data);
  for (const [key, value] of Object.entries(forced)) {
    if (data[key] !== undefined && data[key] !== value) throw new ScopeError(`${model}.${key} 값이 범위와 다릅니다`);
  }
  return { ...data, ...forced };
}

/** 출석(완료·결석)은 선생님만 체크한다 (LESSON-01). 학생 범위(선생님이 대신 바꾸기 포함)에서는 쓰지 못한다 */
function checkTeacherOnlyFields(model: Model, data: Where, scope: Scope) {
  if (scope.kind === "student" && model === "Lesson" && data.attendance !== undefined) throw new ScopeError("출석은 선생님 범위에서만 체크합니다");
}

/** 수정 데이터: 범위 필드를 바꾸려 하면 오류 */
function checkUpdateData(model: Model, data: Where, scope: Scope) {
  forbidNestedWrites(model, data);
  checkTeacherOnlyFields(model, data, scope);
  if (model === "Teacher") {
    if (data.id !== undefined && data.id !== scope.teacherId) throw new ScopeError("Teacher.id는 바꿀 수 없습니다");
    return;
  }
  let forced: Where;
  try {
    forced = forcedFields(model, scope);
  } catch {
    forced = { teacherId: scope.teacherId };
  }
  for (const [key, value] of Object.entries(forced)) {
    if (data[key] !== undefined && data[key] !== value) throw new ScopeError(`${model}.${key}는 바꿀 수 없습니다`);
  }
}

/** include/select로 딸려오는 관계에 범위를 붙인다 */
function scopeSelection(model: Model, selection: Where, scope: Scope): Where {
  const out: Where = { ...selection };
  const { many, one } = RELATIONS[model];
  for (const [key, value] of Object.entries(selection)) {
    if (!value) continue;
    if (key === "_count") {
      out._count = scopeCount(model, value, scope);
    } else if (many[key]) {
      const v: Where = value === true ? {} : value;
      out[key] = { ...nested(many[key], v, scope), where: and(v.where, readFilter(many[key], scope)) };
    } else if (one[key] && typeof value === "object") {
      out[key] = nested(one[key], value, scope);
    }
  }
  return out;
}

function nested(model: Model, args: Where, scope: Scope): Where {
  const out: Where = { ...args };
  if (args.include) out.include = scopeSelection(model, args.include, scope);
  if (args.select) out.select = scopeSelection(model, args.select, scope);
  return out;
}

function scopeCount(model: Model, value: any, scope: Scope): Where {
  const { many } = RELATIONS[model];
  const select: Where = value === true ? Object.fromEntries(Object.keys(many).map((k) => [k, true])) : (value.select ?? {});
  const out: Where = {};
  for (const [key, v] of Object.entries(select)) {
    if (!v || !many[key]) continue;
    const where = v === true ? undefined : (v as Where).where;
    out[key] = { where: and(where, readFilter(many[key], scope)) };
  }
  return { select: out };
}

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** 쿼리 인자에 범위를 적용한다. 테스트에서도 쓴다 */
export async function applyScope(model: Model, operation: string, args: Where, scope: Scope, created?: Set<string>): Promise<Where> {
  let out: Where;
  if (READ_OPS.has(operation)) {
    out = { ...args, where: scopeWhere(args.where, readFilter(model, scope)) };
  } else if (operation === "update" || operation === "updateMany") {
    checkUpdateData(model, args.data ?? {}, scope);
    const filter = writeFilter(model, scope);
    if (args.where && Object.hasOwn(args.where, "deletedAt")) delete filter.deletedAt; // 되살리기 (UNIQUE 키가 있는 행)
    out = { ...args, where: scopeWhere(args.where, filter) };
  } else if (operation === "create") {
    checkTeacherOnlyFields(model, args.data ?? {}, scope);
    const data = applyForced(model, args.data ?? {}, forcedFields(model, scope));
    await checkStudentParents(model, data, scope, created);
    out = { ...args, data };
  } else if (operation === "createMany") {
    const forced = forcedFields(model, scope);
    const list: Where[] = Array.isArray(args.data) ? args.data : [args.data];
    for (const d of list) checkTeacherOnlyFields(model, d ?? {}, scope);
    const data = list.map((d) => applyForced(model, d, forced));
    for (const d of data) await checkStudentParents(model, d, scope, created);
    out = { ...args, data };
  } else if (operation === "upsert") {
    checkUpdateData(model, args.update ?? {}, scope);
    checkTeacherOnlyFields(model, args.create ?? {}, scope);
    const create = applyForced(model, args.create ?? {}, forcedFields(model, scope));
    await checkStudentParents(model, create, scope, created);
    out = { ...args, where: scopeWhere(args.where, writeFilter(model, scope)), create };
  } else if (operation === "delete" || operation === "deleteMany") {
    throw new ScopeError("delete는 쓰지 않습니다. update로 deletedAt을 넣어 소프트 삭제하세요");
  } else {
    throw new ScopeError(`범위 계층이 지원하지 않는 작업입니다: ${operation}`);
  }
  return nested(model, out, scope);
}

function scoped(scope: Scope) {
  const created = new Set<string>();
  return prisma.$extends({
    name: `scope-${scope.kind}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result: any = await query((await applyScope(model as Model, operation, (args ?? {}) as Where, scope, created)) as any);
          // create·upsert 결과는 범위 값을 강제했거나 범위 안의 행이라 본인 것이다
          if (scope.kind === "student" && (operation === "create" || operation === "upsert") && typeof result?.id === "string") {
            created.add(`${model}:${result.id}`);
          }
          return result;
        },
      },
    },
  });
}

function requireId(value: string, name: string) {
  if (typeof value !== "string" || value.length === 0) throw new ScopeError(`${name}가 없습니다`);
}

/** 선생님 범위. teacherId는 반드시 서버 세션에서 꺼낸 값 */
export function teacherDb(teacherId: string) {
  requireId(teacherId, "teacherId");
  return scoped({ kind: "teacher", teacherId });
}

/** 학생 범위. 둘 다 반드시 서버 세션에서 꺼낸 값 */
export function studentDb(teacherId: string, studentId: string) {
  requireId(teacherId, "teacherId");
  requireId(studentId, "studentId");
  return scoped({ kind: "student", teacherId, studentId });
}

/**
 * 선생님이 학생 일정을 대신 바꿀 때 (SCH-16). 학생 범위와 같이 그 학생 것만 보고 바꾸며, 이력은 TEACHER로 남는다.
 * teacherId는 서버 세션, studentId는 그 선생님의 학생인지 먼저 확인한 값이어야 한다
 */
export function studentDbByTeacher(teacherId: string, studentId: string) {
  requireId(teacherId, "teacherId");
  requireId(studentId, "studentId");
  return scoped({ kind: "student", teacherId, studentId, byTeacher: true });
}

export type ScopedDb = ReturnType<typeof teacherDb>;
