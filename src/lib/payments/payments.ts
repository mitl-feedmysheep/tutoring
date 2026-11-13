import type { ScopedDb } from "@/lib/db/scope";
import { addMonths, kstParts, monthDate, monthKey, monthOf, monthRange, parseMonthKey, type YearMonth } from "@/lib/schedule/kst";
import { isUniqueError } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";

// 과외비 납부 체크 (PAY-01~04). payment는 UNIQUE(student_id, month)라 체크를 풀면 삭제 표시, 다시 체크하면 되살린다.
// 선생님은 teacherDb, 학생은 studentDb (범위 계층이 학생의 납부 쓰기를 막고 본인 것만 보여 준다)

const ID = /^[0-9a-f-]{36}$/;

export type PaymentMonth = { month: YearMonth; key: string; paidAt: Date | null };

/** PAY-03: 체크할 수 있는 마지막 달 = 다음 달 (선납을 미리 받는 경우) */
export const lastPayableMonth = (now: Date) => addMonths(monthOf(now), 1);

/** 가입한 달 ~ last, 최근 달부터 */
function monthsBetween(first: YearMonth, last: YearMonth) {
  const out: YearMonth[] = [];
  for (let m = last; monthKey(m) >= monthKey(first); m = addMonths(m, -1)) out.push(m);
  return out;
}

/** PAY-01, 03: 납부 체크. paid=false면 체크를 푼다 */
export async function setPayment(db: ScopedDb, studentId: unknown, month: unknown, paid: unknown, now = new Date()) {
  if (typeof studentId !== "string" || !ID.test(studentId) || typeof paid !== "boolean") throw new ScheduleError("잘못된 요청이에요");
  const ym = parseMonthKey(typeof month === "string" ? month : undefined);
  if (!ym) throw new ScheduleError("잘못된 요청이에요");

  const student = await db.student.findFirst({ where: { id: studentId, deactivatedAt: null }, select: { id: true, createdAt: true } });
  if (!student) throw new ScheduleError("없는 학생이에요");
  const key = monthKey(ym);
  if (key < monthKey(monthOf(student.createdAt)) || key > monthKey(lastPayableMonth(now))) throw new ScheduleError("체크할 수 없는 달이에요");

  const where = { studentId: student.id, month: monthDate(ym) };
  if (!paid) {
    await db.payment.updateMany({ where, data: { deletedAt: now } });
    return;
  }
  if (await db.payment.count({ where })) return; // 이미 체크됨
  const revive = async () => (await db.payment.updateMany({ where: { ...where, deletedAt: { not: null } }, data: { deletedAt: null, paidAt: now } })).count > 0;
  if (await revive()) return;
  try {
    // teacher_id는 범위 계층이 채운다
    await db.payment.create({ data: { ...where, paidAt: now } as never });
  } catch (e) {
    // 같은 달을 동시에 체크한 경우: 먼저 만든 행이 있으면 됐다. 그 사이 풀렸으면 되살린다
    if (!isUniqueError(e)) throw e;
    if (!(await db.payment.count({ where })) && !(await revive())) throw e;
  }
}

/** PAY-03: 그 달 학생별 납부. 그 달 말까지 가입한 활성 학생, 이름 순 */
export async function monthPayments(db: ScopedDb, ym: YearMonth) {
  const month = monthDate(ym);
  const [students, payments] = await Promise.all([
    db.student.findMany({
      where: { deactivatedAt: null, createdAt: { lt: monthRange(ym).end } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.payment.findMany({ where: { month }, select: { studentId: true, paidAt: true } }),
  ]);
  const paid = new Map(payments.map((p) => [p.studentId, p.paidAt]));
  return students.map((s) => ({ ...s, paidAt: paid.get(s.id) ?? null }));
}

/**
 * 학생 한 명의 달별 납부 (최근 달부터). 없는 학생이면 null
 * - upTo "next" (선생님, PAY-03): 가입한 달 ~ 다음 달
 * - upTo "this" (학생, PAY-04): 가입한 달 ~ 이번 달. 다음 달을 미리 체크했으면 포함
 */
export async function paymentHistory(db: ScopedDb, studentId: string, upTo: "this" | "next", now = new Date()): Promise<PaymentMonth[] | null> {
  const student = await db.student.findFirst({ where: { id: studentId }, select: { createdAt: true } });
  if (!student) return null;
  const rows = await db.payment.findMany({ where: { studentId }, select: { month: true, paidAt: true } });
  const paid = new Map(rows.map((r) => [r.month.toISOString().slice(0, 7), r.paidAt]));

  const next = lastPayableMonth(now);
  const last = upTo === "next" || paid.has(monthKey(next)) ? next : monthOf(now);
  return monthsBetween(monthOf(student.createdAt), last).map((m) => ({ month: m, key: monthKey(m), paidAt: paid.get(monthKey(m)) ?? null }));
}

/** "11월 3일" (KST) */
export function paidDateText(date: Date) {
  const p = kstParts(date);
  return `${p.month}월 ${p.day}일`;
}
