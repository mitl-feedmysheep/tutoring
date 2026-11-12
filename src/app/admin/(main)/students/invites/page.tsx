import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/session";
import { listInvites } from "@/lib/admin/invites";
import { formatKst } from "@/lib/time";
import { IssueInviteForm } from "./issue-form";
import { RevokeButton } from "./revoke-button";

export const metadata: Metadata = { title: "초대 링크" };

const STATE = {
  ok: { label: "사용 가능", variant: "default" },
  used: { label: "가입 완료", variant: "secondary" },
  expired: { label: "만료", variant: "outline" },
  revoked: { label: "취소", variant: "outline" },
} as const;

export default async function InvitesPage() {
  const { db } = await requireTeacher();
  const invites = await listInvites(db);

  return (
    <div className="grid grid-cols-1 gap-8">
      <section className="grid grid-cols-1 gap-3">
        <p className="text-sm text-muted-foreground">학생마다 링크를 하나씩 발급해요. 1시간 동안 한 번만 쓸 수 있어요.</p>
        <IssueInviteForm />
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="font-medium">발급한 링크</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 발급한 링크가 없어요.</p>
        ) : (
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>메모</TableHead>
                  <TableHead>발급</TableHead>
                  <TableHead>만료</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.memo ?? <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="tabular-nums">{formatKst(i.createdAt)}</TableCell>
                    <TableCell className="tabular-nums">{formatKst(i.expiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={STATE[i.state].variant}>{STATE[i.state].label}</Badge>
                      {i.student && <span className="ml-2 text-sm text-muted-foreground">{i.student.name}</span>}
                    </TableCell>
                    <TableCell>{i.state === "ok" && <RevokeButton id={i.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
