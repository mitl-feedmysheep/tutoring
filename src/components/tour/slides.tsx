import { Bell, BookOpen, CalendarDays, ChevronRight, Lightbulb, MessageCircle, PenLine, Video } from "lucide-react";
import { MockCalendar, MockCard, MockChip, MockSubScreen, MockTabScreen, mockMonth } from "./mock";

// 앱 둘러보기 슬라이드 (AUTH-14). 가짜 화면에서 data-highlight 붙은 곳을 밝게 두고 나머지는 어둡게, 옆에 설명 말풍선.
// 강조가 없는 슬라이드(처음·끝·알림)는 화면 자체가 설명이다

export type TourSlide = {
  id: string;
  Screen: React.ComponentType<{ onDone: () => void }>;
  /** 강조한 곳의 설명. 없으면 강조하지 않는다 */
  tip?: string;
  /** 말풍선을 강조한 곳 위에 둘지 아래에 둘지 */
  tipAt?: "top" | "bottom";
};

const H = { "data-highlight": true };

function cheer() {
  return <span className="text-[17px]">김지은님, Keep it up!</span>;
}

function LessonTab({ focus }: { focus: "next" | "calendar" }) {
  const m = mockMonth();
  return (
    <MockTabScreen
      tab="/"
      title={cheer()}
      action={<span className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-bold text-primary">+ 예약</span>}
    >
      <section {...(focus === "next" ? H : {})} className="flex flex-col gap-1 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
        <small className="text-[13px] opacity-85">다음 수업 · {m.nextText}</small>
        <b className="text-xl tabular-nums">19:00 – 20:00</b>
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span>고정 수업 · 1명 참여</span>
          <span className="rounded-full bg-white px-5 py-2 text-sm font-bold text-primary">들어가기</span>
        </div>
      </section>
      <div className="-mb-1 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold">이번 달 수업</h2>
        <span className="text-sm text-muted-foreground">전체 보기</span>
      </div>
      <div {...(focus === "calendar" ? H : {})}>
        <MockCalendar
          title={`${m.year}년 ${m.month}월`}
          mark={(d) => (m.lessonDays.includes(d) ? (d < m.today ? "past" : "fixed") : d === m.booked ? "booked" : null)}
        />
      </div>
    </MockTabScreen>
  );
}

function Booking() {
  const m = mockMonth();
  const rows = [
    { time: "19:00 – 20:00", who: "1명 참여 예정", mine: true },
    { time: "20:00 – 21:00", who: "아직 없음", mine: false },
  ];
  return (
    <MockSubScreen title="수업 예약">
      <MockCard>
        <div className="flex min-h-13 items-center justify-between gap-3 px-4 py-2.5 text-[15px]">
          <span className="min-w-0">
            고정 일정<small className="ml-2 text-[13px] text-muted-foreground">매주 화·목 19:00</small>
          </span>
          <span className="shrink-0 text-sm font-bold text-primary">바꾸기 ›</span>
        </div>
      </MockCard>
      <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">수업 시작 1시간 전까지 예약하고, 취소하거나 옮길 수 있어요.</p>
      <div {...H} className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-bold">{m.nextText}</h2>
        <MockCard>
          {rows.map((r) => (
            <div key={r.time} className="flex min-h-13 items-center justify-between gap-3 px-4 py-2.5 text-[15px] tabular-nums">
              <span>
                {r.time}
                <small className="ml-2 text-[13px] text-muted-foreground">{r.who}</small>
              </span>
              {r.mine ? <MockChip>고정</MockChip> : <span className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">예약</span>}
            </div>
          ))}
        </MockCard>
      </div>
    </MockSubScreen>
  );
}

function LessonNote() {
  const m = mockMonth();
  return (
    <MockSubScreen title="지난 수업">
      <MockCard>
        {[
          ["날짜", m.nextText],
          ["시간", "19:00 – 20:00"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-3 text-[15px] tabular-nums">
            <span className="text-muted-foreground">{k}</span>
            <b className="font-semibold">{v}</b>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 text-[15px]">
          <span className="text-muted-foreground">출석</span>
          <MockChip>참석</MockChip>
        </div>
      </MockCard>
      <div {...H} className="flex flex-col gap-2">
        <span className="px-1 text-sm font-bold">내 노트</span>
        <div className="min-h-36 rounded-xl bg-card px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line shadow-[0_0_0_1px_var(--color-border)]">
          {"- I'm looking forward to it.\n- How have you been? (오랜만일 때)\n- 숙제: 주말 일기 3문장 말해 보기"}
        </div>
        <span className="flex h-11 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground">저장</span>
      </div>
    </MockSubScreen>
  );
}

function StudyTab({ focus }: { focus: "top" | "list" }) {
  const m = mockMonth();
  const totals = [
    ["이번 주", "2시간 40분", "4일 중 3일"],
    ["이번 달", "11시간 5분", `${m.today}일 중 ${m.studied.length}일`],
    ["누적", "48시간 30분", "62일 중 51일"],
  ];
  return (
    <MockTabScreen tab="/study" title="공부">
      <div {...(focus === "top" ? H : {})} className="flex flex-col gap-3">
        <section className="grid grid-cols-3 divide-x divide-border rounded-xl bg-card py-3 shadow-[0_0_0_1px_var(--color-border)]">
          {totals.map(([label, time, days]) => (
            <div key={label} className="flex flex-col items-center gap-0.5 px-1 text-center">
              <span className="text-xs text-muted-foreground">{label}</span>
              <b className="text-[14px] font-bold tabular-nums">{time}</b>
              <span className="text-[11px] text-muted-foreground tabular-nums">{days}</span>
            </div>
          ))}
        </section>
        <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground">
          <PenLine className="size-4" />
          오늘 공부 기록하기
        </span>
      </div>
      {focus === "top" ? (
        <MockCalendar title={`${m.year}년 ${m.month}월`} mark={(d) => (m.studied.includes(d) ? "check" : null)} />
      ) : (
        <div {...H} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-bold">이번 달 기록</h2>
          <MockCard>
            {[
              { day: "오늘", time: "50분", memo: "- 섀도잉: TED 강연 5분\n- 오늘 배운 표현으로 혼잣말", fb: "- 문장 끝 억양이 자꾸 올라감. 내일 다시 녹음해 보기" },
              { day: "어제", time: "1시간 10분", memo: "- 수업 복습, 노트 표현 소리 내어 읽기", fb: "- 관사 a/the 헷갈림" },
            ].map((r) => (
              <div key={r.day} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between text-[15px] tabular-nums">
                  <span className="font-semibold">{r.day}</span>
                  <b className="font-bold text-primary">{r.time}</b>
                </div>
                <p className="line-clamp-2 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{r.memo}</p>
                <div className="flex gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-[13px] leading-relaxed">
                  <Lightbulb className="mt-[3px] size-3.5 shrink-0 text-primary" />
                  <p className="line-clamp-2 min-w-0 text-foreground/80">{r.fb}</p>
                </div>
              </div>
            ))}
          </MockCard>
        </div>
      )}
    </MockTabScreen>
  );
}

function MyTab() {
  return (
    <MockTabScreen tab="/my" title="MY">
      <section className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_var(--color-border)]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary">김</span>
        <div className="min-w-0">
          <p className="font-semibold">김지은</p>
          <p className="text-xs text-muted-foreground">담당 선생님 · 박서연</p>
        </div>
      </section>
      <MockCard>
        <div {...H}>
          {["게시판", "자료실", "납부 내역"].map((label) => (
            <div key={label} className="flex items-center justify-between border-b border-border px-4 py-3.5 text-[15px] last:border-b-0">
              <span>{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </MockCard>
      <MockCard>
        {["알림 설정", "비밀번호 변경"].map((label) => (
          <div key={label} className="flex items-center justify-between px-4 py-3.5 text-[15px]">
            <span>{label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        ))}
      </MockCard>
    </MockTabScreen>
  );
}

function Intro() {
  const items = [
    { icon: Video, text: "앱에서 바로 화상 수업 입장" },
    { icon: CalendarDays, text: "수업 예약·옮기기를 내 손으로" },
    { icon: BookOpen, text: "수업 노트와 매일 공부 기록" },
    { icon: MessageCircle, text: "선생님과 1:1 게시판·자료실" },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 bg-background px-7 text-center">
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- 작은 고정 아이콘 */}
        <img src="/icon-192.png" alt="" width={88} height={88} className="size-22 rounded-[22%] shadow-sm" />
        <h2 className="text-2xl font-bold tracking-tight">Tutoring</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          비대면 영어 말하기 과외,
          <br />
          수업부터 매일 공부까지 한 앱에서
        </p>
      </div>
      <ul className="flex w-full max-w-72 flex-col gap-2.5 text-left">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-[15px] shadow-[0_0_0_1px_var(--color-border)]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
              <Icon className="size-4 text-primary" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">옆으로 넘겨서 살펴보세요 →</p>
    </div>
  );
}

function Notifications() {
  const pushes = [
    { title: "곧 수업이에요", body: "19:00 수업이 30분 뒤에 시작해요", when: "18:30" },
    { title: "선생님이 답글을 남겼어요", body: "좋아요! 다음 수업 때 같이 연습해 봐요 :)", when: "어제" },
    { title: "오늘 공부 기록을 남겨 주세요", body: "짧게라도 오늘 한 공부를 적어 두면 좋아요", when: "23:00" },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-primary/90 to-primary px-5 text-center text-primary-foreground">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/20">
        <Bell className="size-7" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">놓치지 않게 알려 드려요</h2>
        <p className="text-sm leading-relaxed opacity-90">
          수업 30분 전, 선생님 글·답글, 밤 11시 공부 기록을
          <br />
          휴대폰 알림으로 받아요
        </p>
      </div>
      <div className="flex w-full max-w-80 flex-col gap-2 text-left text-foreground">
        {pushes.map((p) => (
          <div key={p.title} className="flex gap-3 rounded-2xl bg-white/95 px-3.5 py-3 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- 작은 고정 아이콘 */}
            <img src="/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[22%]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-[13px]">{p.title}</b>
                <span className="shrink-0 text-[11px] text-muted-foreground">{p.when}</span>
              </div>
              <p className="truncate text-[13px] text-muted-foreground">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed opacity-80">아이폰은 Safari에서 &lsquo;홈 화면에 추가&rsquo;한 앱에서 알림을 받을 수 있어요</p>
    </div>
  );
}

function Outro({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-8 text-center">
      <h2 className="text-2xl leading-snug font-bold">
        이제 수업을
        <br />
        시작해 볼까요?
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        선생님께 받은 초대 링크로 가입한 뒤
        <br />
        이메일과 비밀번호로 로그인해요
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <div className="h-1 w-12 rounded-full bg-primary/30" />
        <div className="h-1 w-8 rounded-full bg-primary/20" />
        <div className="h-1 w-4 rounded-full bg-primary/10" />
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-8 rounded-2xl bg-primary px-10 py-3.5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-opacity hover:opacity-90"
      >
        로그인하러 가기
      </button>
    </div>
  );
}

export const TOUR_SLIDES: TourSlide[] = [
  { id: "intro", Screen: Intro },
  {
    id: "next-lesson",
    Screen: () => <LessonTab focus="next" />,
    tip: "🎧 다음 수업을 바로 확인해요. 수업 10분 전부터 '들어가기'를 눌러 화상 수업에 들어가요",
    tipAt: "bottom",
  },
  {
    id: "lesson-calendar",
    Screen: () => <LessonTab focus="calendar" />,
    tip: "📅 이번 달 수업을 달력으로 한눈에 봐요. 날짜를 누르면 그 수업을 열고, 오른쪽 위 '+ 예약'으로 수업을 더 잡아요",
    tipAt: "top",
  },
  {
    id: "booking",
    Screen: Booking,
    tip: "🗓️ 선생님이 열어 둔 시간 중에서 골라 바로 예약해요. 매주 같은 시간이면 고정 일정으로 정해 두면 자동으로 잡혀요",
    tipAt: "top",
  },
  {
    id: "note",
    Screen: LessonNote,
    tip: "✏️ 수업이 시작되면 오늘 배운 표현과 숙제를 내 노트에 적어요. 지난 수업 노트도 언제든 다시 볼 수 있어요",
    tipAt: "top",
  },
  {
    id: "study",
    Screen: () => <StudyTab focus="top" />,
    tip: "⏱️ 매일 공부한 시간과 내용, 사진을 기록해요. 이번 주·이번 달에 며칠 공부했는지 한눈에 보여요",
    tipAt: "bottom",
  },
  {
    id: "study-feedback",
    Screen: () => <StudyTab focus="list" />,
    tip: "💡 기록마다 '오늘의 피드백'을 남겨 두고, 다시 볼 때 부족한 점을 복기해요",
    tipAt: "top",
  },
  {
    id: "my",
    Screen: MyTab,
    tip: "💬 선생님과 1:1 게시판으로 질문하고, 선생님이 공유한 수업 자료(PDF)와 납부 내역을 확인해요",
    tipAt: "bottom",
  },
  { id: "notifications", Screen: Notifications },
  { id: "outro", Screen: Outro },
];
