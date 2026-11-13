import { requireUser } from "@/lib/auth/session";
import { dailyCheer } from "@/lib/app/cheer";
import { TabScreen } from "@/components/app/screens";

// 수업 탭. 앱을 열면 첫 화면 (APP-01, APP-02). 선생님·학생 공용
export default async function LessonTab() {
  const account = await requireUser();
  const isTeacher = account.claims.role === "teacher";
  return (
    <TabScreen
      title={<span className="text-[15px]">{`${account.name}${isTeacher ? " 선생님" : "님"}, ${dailyCheer()}`}</span>}
    >
      <Placeholder>다음 수업과 이번 달 수업 달력이 여기에 나와요.</Placeholder>
    </TabScreen>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
