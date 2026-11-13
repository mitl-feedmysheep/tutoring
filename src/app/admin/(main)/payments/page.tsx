import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PaymentToggle } from "@/components/admin/payment-toggle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/session";
import { lastPayableMonth, monthPayments, paidDateText } from "@/lib/payments/payments";
import { addMonths, monthKey, monthOf, parseMonthKey, type YearMonth } from "@/lib/schedule/kst";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "과외비" };

// 과외비 납부 체크 (PAY-01, 03). 달을 골라 학생마다 체크. 다음 달까지 넘길 수 있다
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { db } = await requireTeacher();
  const now = new Date();
  const last = lastPayableMonth(now);
  const asked = parseMonthKey((await searchParams).month);
  const ym = asked && monthKey(asked) <= monthKey(last) ? asked : monthOf(now);
  const rows = await monthPayments(db, ym);
  const paidCount = rows.filter((r) => r.paidAt).length;

  const href = (m: YearMonth) => `/admin/payments?month=${monthKey(m)}`;
  const arrow = "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted";
  const isLast = monthKey(ym) >= monthKey(last);

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-xl font-semibold">과외비</h1>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={href(addMonths(ym, -1))} aria-label="이전 달" className={arrow}>
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-24 text-center font-medium tabular-nums">
            {ym.year}년 {ym.month}월
          </span>
          {isLast ? (
            <span aria-hidden className={cn(arrow, "opacity-30 hover:bg-transparent")}>
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link href={href(addMonths(ym, 1))} aria-label="다음 달" className={arrow}>
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length}명 중 <b className="font-medium text-foreground">{paidCount}명</b> 납부
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 달에 수업하는 학생이 없어요.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead className="hidden sm:table-cell">확인한 날</TableHead>
                <TableHead className="w-28 text-right">납부</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/students/${r.id}#payments`} className="text-emerald-700 hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{r.paidAt ? paidDateText(r.paidAt) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <PaymentToggle studentId={r.id} month={monthKey(ym)} paid={r.paidAt !== null} label={`${r.name} ${ym.month}월`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
