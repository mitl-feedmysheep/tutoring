import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">개인정보처리방침</h1>
      <p className="mt-2 text-muted-foreground">시행일: 2026년 11월 11일</p>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-semibold">1. 수집하는 정보</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>가입 정보: 이름, 출생연도, 성별, 이메일, 비밀번호(암호화 저장)</li>
          <li>선생님이 입력하는 정보: 직업, 수업 노트</li>
          <li>서비스 이용 중 생성되는 정보: 수업 예약과 출석, 공부 기록과 첨부 사진, 게시판 글, 과외비 납부 여부</li>
          <li>알림 수신을 위한 브라우저 푸시 구독 정보</li>
        </ul>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-base font-semibold">2. 이용 목적</h2>
        <p>
          과외 일정 관리, 화상 수업 진행, 학습 기록과 피드백 제공, 과외비 납부 확인, 수업 및 학습 알림 발송에만
          사용합니다. 광고나 마케팅에는 사용하지 않습니다.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-base font-semibold">3. Google 계정 데이터</h2>
        <p>
          선생님이 Google 계정을 연결하면, 수업 일정에 Google Meet 링크가 포함된 캘린더 일정을 만들기 위해 Google
          Calendar 일정 권한만 사용합니다. 예약한 학생의 이메일은 해당 일정의 참석자로 추가됩니다. 그 밖의 Google
          데이터는 읽거나 저장하지 않으며, 제3자에게 제공하지 않습니다.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-base font-semibold">4. 보관과 위탁</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>데이터는 서비스 운영 서버에 저장되며, 첨부 파일은 Cloudflare R2에 비공개로 저장됩니다.</li>
          <li>각 선생님의 학생 데이터는 다른 선생님에게 공개되지 않습니다.</li>
          <li>탈퇴하거나 삭제를 요청하면 지체 없이 파기합니다.</li>
        </ul>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-base font-semibold">5. 문의</h2>
        <p>개인정보 열람, 수정, 삭제 요청은 담당 선생님에게 연락해 주세요.</p>
      </section>
    </main>
  );
}
