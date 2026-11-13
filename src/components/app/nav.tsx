"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { nextDepth, type NavKind } from "@/lib/app/nav-depth";

// 앱 안에서 쌓은 화면 수. 새로 고침하거나 앱을 새로 열면 0부터 다시 센다
let depth = 0;
let pending: NavKind | null = null;
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
    depth = nextDepth(depth, pending ?? "push");
    pending = null;
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

/** 하위 화면의 ← 버튼. 앱 안에서 쌓은 화면이 없으면 그 화면이 속한 탭(fallback)으로 간다 (APP-08) */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로"
      className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
      onClick={() => {
        if (depth > 0) {
          router.back();
        } else {
          markReplace();
          router.replace(fallback);
        }
      }}
    >
      <ChevronLeft className="size-6" />
    </button>
  );
}
