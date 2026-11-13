import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { paidDateText, paymentHistory } from "@/lib/payments/payments";
import { SubScreen } from "@/components/app/screens";
import { Card, Chip, Row, Rule } from "@/components/app/ui";

export const metadata: Metadata = { title: "납부 내역" };

// MY > 납부 내역 (PAY-02, 04). 학생은 보기만 한다. 선생님은 requireStudent가 수업 탭으로 보낸다
export default async function PaymentsScreen() {
  const { db, studentId } = await requireStudent();
  const months = await paymentHistory(db, studentId, "this");
  if (!months) notFound();

  return (
    <SubScreen title="납부 내역" fallback="/my">
      <Rule>과외비는 매달 초에 미리 내요. 선생님이 확인하면 &lsquo;납부 완료&rsquo;로 바뀌어요.</Rule>
      <Card>
        {months.map((m) => (
          <Row key={m.key}>
            <span>
              {m.month.year}년 {m.month.month}월
            </span>
            <span className="flex items-center gap-2">
              {m.paidAt && <span className="text-xs text-muted-foreground">{paidDateText(m.paidAt)}</span>}
              {m.paidAt ? <Chip>납부 완료</Chip> : <Chip tone="gray">납부 전</Chip>}
            </span>
          </Row>
        ))}
      </Card>
    </SubScreen>
  );
}
