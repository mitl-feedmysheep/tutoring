import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSystemAdmin } from "@/lib/auth/session";
import { listTeachers } from "@/lib/auth/teachers";
import { formatKst } from "@/lib/time";
import { CreateTeacherForm } from "./create-form";

export const metadata: Metadata = { title: "선생님 관리" };

// ADMIN-05: 시스템 관리자 전용. 다른 선생님은 404
export default async function TeachersPage() {
  const { account } = await requireSystemAdmin();
  const teachers = await listTeachers(account);

  return (
    <div className="grid grid-cols-1 gap-8">
      <section className="grid grid-cols-1 gap-3">
        <h1 className="text-xl font-semibold">선생님 관리</h1>
        <p className="text-sm text-muted-foreground">새 선생님은 임시 비밀번호로 만들어지고, 첫 로그인 때 직접 비밀번호를 바꿔요.</p>
        <CreateTeacherForm />
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="font-medium">선생님 목록</h2>
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>만든 날</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {t.isAdmin && <Badge className="ml-2">관리자</Badge>}
                    {t.mustChangePassword && (
                      <Badge variant="outline" className="ml-2">
                        첫 로그인 전
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.email}</TableCell>
                  <TableCell className="tabular-nums">{formatKst(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
