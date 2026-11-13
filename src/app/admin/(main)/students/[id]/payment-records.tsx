import { PaymentToggle } from "@/components/admin/payment-toggle";

type Month = { key: string; label: string; paidText: string | null };

// 학생 카드의 과외비 납부 내역 (ADMIN-01, PAY-03). 가입한 달 ~ 다음 달, 최근 달부터
/** readOnly: 비활성 학생은 보기만 한다 */
export function PaymentRecords({ studentId, studentName, months, readOnly = false }: { studentId: string; studentName: string; months: Month[]; readOnly?: boolean }) {
  return (
    <section id="payments" className="grid scroll-mt-4 gap-3 rounded-lg border bg-background p-4">
      <h3 className="font-medium">과외비</h3>
      <ul className="grid divide-y">
        {months.map((m) => (
          <li key={m.key} className="flex items-center justify-between gap-3 py-2 text-sm tabular-nums">
            <span>
              {m.label}
              {m.paidText && <span className="ml-2 text-xs text-muted-foreground">{m.paidText} 확인</span>}
            </span>
            {readOnly ? (
              <span className={m.paidText ? "text-emerald-700" : "text-muted-foreground"}>{m.paidText ? "납부" : "납부 전"}</span>
            ) : (
              <PaymentToggle studentId={studentId} month={m.key} paid={m.paidText !== null} label={`${studentName} ${m.label}`} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
