"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { nextDepth, type NavKind } from "@/lib/app/nav-depth";

// 앱 안에서 쌓은 화면 수. 새로 고침하거나 앱을 새로 열면 0부터 다시 센다
let depth = 0;
let pending: NavKind | null = null;
/** 다음 popstate가 몇 화면을 건너뛰는지 (history.go(-n)) */
let popSteps = 1;
let lastPath: string | null = null;

/** 기록을 쌓지 않는 이동(탭 이동, 돌아갈 곳이 없을 때 탭으로)을 하기 직전에 부른다 */
function markReplace() {
  pending = "replace";
}

/** 루트 레이아웃에 하나 둔다. 주소가 바뀔 때마다 쌓인 화면 수를 고친다 */
export function NavTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const onPop = () => {
      pending = "pop";
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (lastPath === null || pathname === lastPath) {
      lastPath = pathname;
      return;
    }
    const kind = pending ?? "push";
    depth = nextDepth(depth, kind, kind === "pop" ? popSteps : 1);
    pending = null;
    popSteps = 1;
    lastPath = pathname;
  }, [pathname]);

  return null;
}

/** 하단 탭 링크. 탭끼리는 기록을 쌓지 않는다 (APP-07) */
export function TabLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      replace
      className={className}
      onClick={() => {
        if (href !== pathname) markReplace();
      }}
    >
      {children}
    </Link>
  );
}

type Router = ReturnType<typeof useRouter>;

/** 뒤로 가기. 앱 안에서 쌓은 화면이 없으면 fallback 탭으로 (APP-08) */
export function goBack(router: Router, fallback: string) {
  if (depth > 0) {
    router.back();
  } else {
    markReplace();
    router.replace(fallback);
  }
}

/** n 화면 뒤로. 앱 안에서 그만큼 쌓여 있지 않으면 otherwise로 바꾼다 (기록 안 쌓음) */
export function goBackSteps(router: Router, n: number, otherwise: string) {
  if (depth >= n) {
    popSteps = n;
    window.history.go(-n);
  } else {
    replaceTo(router, otherwise);
  }
}

/** 기록을 쌓지 않고 지금 화면을 다른 화면으로 바꾼다 (같은 탭 안 보기 전환, 옮긴 뒤 새 수업 화면 등) */
export function replaceTo(router: Router, href: string) {
  if (href.split("?")[0] !== window.location.pathname) markReplace();
  router.replace(href);
}

/** 기록을 쌓지 않는 링크 (탭 안 보기 전환: 달 넘기기, 예정/지난 수업) */
export function ReplaceLink({ href, className, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      replace
      scroll={false}
      className={className}
      // 쿼리만 바뀌면 주소(pathname)가 그대로라 NavTracker가 세지 않는다. 그때는 표시를 남기지 않는다
      onClick={() => {
        if (href.split("?")[0] !== pathname) markReplace();
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** 하위 화면의 ← 버튼. 앱 안에서 쌓은 화면이 없으면 그 화면이 속한 탭(fallback)으로 간다 (APP-08) */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로"
      className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
      onClick={() => goBack(router, fallback)}
    >
      <ChevronLeft className="size-6" />
    </button>
  );
}
