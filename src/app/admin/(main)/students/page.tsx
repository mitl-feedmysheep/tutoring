import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/session";
import { listDeactivatedStudents, listStudents, RESET_PASSWORD } from "@/lib/admin/students";
import { formatKst } from "@/lib/time";
import { ResetPasswordButton } from "./reset-button";

export const metadata: Metadata = { title: "학생 목록" };

export default async function StudentsPage() {
  const { db } = await requireTeacher();
  const [students, inactive] = await Promise.all([listStudents(db), listDeactivatedStudents(db)]);

  return (
    <div className="grid grid-cols-1 gap-4">
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 가입한 학생이 없어요. 초대 링크 탭에서 링크를 발급해 학생에게 보내 주세요.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead className="hidden xl:table-cell">출생연도</TableHead>
                <TableHead className="hidden xl:table-cell">성별</TableHead>
                <TableHead className="hidden md:table-cell">가입</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/students/${s.id}`} className="text-emerald-700 hover:underline">
                      {s.name}
                    </Link>
                    {s.mustChangePassword && (
                      <Badge variant="outline" className="ml-2">
                        비밀번호 초기화됨
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell className="hidden tabular-nums xl:table-cell">{s.birthYear}</TableCell>
                  <TableCell className="hidden xl:table-cell">{s.gender === "MALE" ? "남성" : "여성"}</TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{formatKst(s.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <ResetPasswordButton id={s.id} name={s.name} password={RESET_PASSWORD} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ADMIN-04: 비활성 학생은 목록에서 숨기고 여기에 접어 둔다. 눌러서 기록을 보고 다시 활성화한다 */}
      {inactive.length > 0 && (
        <details className="rounded-lg border bg-background">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">비활성 학생 {inactive.length}명</summary>
          <ul className="grid divide-y border-t">
            {inactive.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span>
                  <Link href={`/admin/students/${s.id}`} className="font-medium text-emerald-700 hover:underline">
                    {s.name}
                  </Link>
                  <span className="ml-2 text-muted-foreground">{s.email}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatKst(s.deactivatedAt)} 비활성화</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
