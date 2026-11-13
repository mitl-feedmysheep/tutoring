import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth/session";
import { googleMeetConfigured, meetingSettings } from "@/lib/meeting/meeting";
import { Button } from "@/components/ui/button";
import { disconnectGoogleAction } from "@/app/admin/meeting-actions";
import { MeetingSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "화상 수업" };

const GOOGLE_RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "구글 계정을 연결했어요." },
  denied: { ok: false, text: "구글 연결을 취소했어요." },
  scope: { ok: false, text: "캘린더 권한이 필요해요. 다시 연결하면서 캘린더 항목을 체크해 주세요." },
  expired: { ok: false, text: "연결 시간이 지났어요. 다시 눌러 주세요." },
  config: { ok: false, text: "서버 설정이 아직 안 되어 있어요 (MEETING_TOKEN_KEY, GOOGLE_CLIENT_ID)." },
  failed: { ok: false, text: "구글 연결에 실패했어요. 다시 시도해 주세요." },
};

// 화상 수업 설정 (MEET-06, MEET-01): 방식 고르기, 고정 링크, 구글 계정 연결
export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { db, teacherId } = await requireTeacher();
  const settings = await meetingSettings(db, teacherId);
  const result = GOOGLE_RESULT[(await searchParams).google ?? ""];
  const configured = googleMeetConfigured();

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-6">
      <h1 className="text-xl font-semibold">화상 수업</h1>

      {result && (
        <p role="status" className={result.ok ? "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" : "rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"}>
          {result.text}
        </p>
      )}

      <section className="grid gap-3">
        <h2 className="font-semibold">방식</h2>
        <MeetingSettingsForm provider={settings.provider} fixedUrl={settings.fixedUrl} googleConnected={Boolean(settings.google)} />
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">구글 계정</h2>
        <div className="grid gap-3 rounded-lg border bg-background p-4">
          {settings.google ? (
            <>
              <p className="text-sm">
                <b className="font-medium">{settings.google.email}</b> 계정에 연결되어 있어요. 수업 10분 전에 이 계정 캘린더에 수업 일정과 Meet 링크가 만들어져요.
              </p>
              <form action={disconnectGoogleAction}>
                <Button type="submit" variant="outline">
                  연결 끊기
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">끊어도 이미 만든 수업 링크는 그대로 쓸 수 있어요.</p>
            </>
          ) : (
            <>
              <p className="text-sm">Google Meet 자동을 쓰려면 수업을 진행할 구글 계정을 연결해 주세요.</p>
              {configured ? (
                <a href="/api/google/connect" className="inline-flex h-9 w-fit items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
                  구글 계정 연결
                </a>
              ) : (
                <p className="text-sm text-red-700">서버 설정이 아직 안 되어 있어요 (MEETING_TOKEN_KEY).</p>
              )}
              <p className="text-xs text-muted-foreground">
                &quot;Google에서 확인하지 않은 앱&quot; 화면이 나오면 &quot;고급&quot; → &quot;Tutoring(으)로 이동&quot;을 누르고, 캘린더 권한을 체크해 허용해 주세요.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-1 text-xs text-muted-foreground">
        <p>· 예약한 학생은 참석자로 들어가요 (초대 메일은 보내지 않아요). 학생이 앱에 가입한 이메일의 구글 계정으로 로그인해 있으면 승인 없이 바로 들어와요.</p>
        <p>· 개인 Gmail 계정은 3명 이상 수업이 60분으로 제한돼요 (1:1은 제한 없음). Zoom 무료는 1:1도 40분이에요.</p>
      </section>
    </div>
  );
}
