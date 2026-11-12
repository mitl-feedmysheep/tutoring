import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/session";
import { listStudents, RESET_PASSWORD } from "@/lib/admin/students";
import { formatKst } from "@/lib/time";
import { ResetPasswordButton } from "./reset-button";

export const metadata: Metadata = { title: "학생 목록" };

export default async function StudentsPage() {
  const { db } = await requireTeacher();
  const students = await listStudents(db);

  return (
    <div className="grid gap-4">
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 가입한 학생이 없어요. 초대 링크 탭에서 링크를 발급해 학생에게 보내 주세요.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>출생연도</TableHead>
                <TableHead>성별</TableHead>
                <TableHead>가입</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.mustChangePassword && (
                      <Badge variant="outline" className="ml-2">
                        비밀번호 초기화됨
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell className="tabular-nums">{s.birthYear}</TableCell>
                  <TableCell>{s.gender === "MALE" ? "남성" : "여성"}</TableCell>
                  <TableCell className="tabular-nums">{formatKst(s.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <ResetPasswordButton id={s.id} name={s.name} password={RESET_PASSWORD} />
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
