import { cn } from "@/lib/utils";

// 웹앱 화면에서 같이 쓰는 조각 (시안의 card, item, chip, rule)

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("divide-y divide-border overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--color-border)]", className)}>{children}</section>;
}

/** 카드 안 한 줄. 왼쪽 글, 오른쪽 칩·버튼 */
export function Row({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-13 items-center justify-between gap-3 px-4 py-2.5 text-[15px] tabular-nums", className)}>{children}</div>;
}

/** 이름표. tone: primary(기본), gray, warn */
export function Chip({ tone = "primary", children }: { tone?: "primary" | "gray" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        tone === "primary" && "bg-accent text-primary",
        tone === "gray" && "bg-muted text-muted-foreground",
        tone === "warn" && "bg-red-50 text-red-700",
      )}
    >
      {children}
    </span>
  );
}

/** 회색 안내 상자 (규칙 안내) */
export function Rule({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

/** 노란 안내 상자 (바뀌는 내용, 취소된 수업 등) */
export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800">{children}</p>;
}

/** 목록의 날짜·달 제목 */
export function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="-mb-2 px-1 text-sm font-bold">{children}</h2>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
