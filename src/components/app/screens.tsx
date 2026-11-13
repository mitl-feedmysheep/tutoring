import { BottomTabs } from "./bottom-tabs";
import { BackButton } from "./nav";

// 웹앱 화면 틀 두 가지 (APP-06)
// - TabScreen: 탭 첫 화면. 위에 제목, 아래에 하단 탭
// - SubScreen: 눌러서 들어가는 화면. 위에 ← 버튼과 제목, 하단 탭 없음

export function TabScreen({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background">
      <header className="flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <h1 className="min-w-0 truncate text-xl font-bold">{title}</h1>
        {action}
      </header>
      <main className="flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">{children}</main>
      <BottomTabs />
    </div>
  );
}

/** fallback: 앱 안에서 쌓인 화면이 없을 때 ← 가 갈 탭 주소 */
export function SubScreen({ title, fallback, children }: { title: string; fallback: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-1 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-1">
          <BackButton fallback={fallback} />
          <h1 className="truncate text-base font-bold">{title}</h1>
        </div>
      </header>
      <main className="flex flex-col gap-4 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+2rem)]">{children}</main>
    </div>
  );
}
