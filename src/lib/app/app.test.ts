import { describe, expect, it } from "vitest";
import { CHEERS, dailyCheer } from "./cheer";
import { nextDepth } from "./nav-depth";
import { kstToUtc } from "@/lib/schedule/kst";

describe("dailyCheer", () => {
  it("같은 KST 날짜에는 같은 문구", () => {
    expect(dailyCheer(kstToUtc(2026, 11, 13, 0))).toBe(dailyCheer(kstToUtc(2026, 11, 13, 23 * 60 + 59)));
  });

  it("KST 자정이 지나면 다음 문구 (UTC 날짜가 아니라 KST 날짜 기준)", () => {
    const before = dailyCheer(kstToUtc(2026, 11, 13, 23 * 60 + 59));
    const after = dailyCheer(kstToUtc(2026, 11, 14, 0));
    expect(CHEERS.indexOf(after)).toBe((CHEERS.indexOf(before) + 1) % CHEERS.length);
  });

  it("문구 수만큼 지나면 처음 문구로 돈다", () => {
    expect(dailyCheer(kstToUtc(2026, 11, 13 + CHEERS.length, 12 * 60))).toBe(dailyCheer(kstToUtc(2026, 11, 13, 12 * 60)));
  });
});

describe("nextDepth", () => {
  it("하위 화면으로 들어가면 쌓이고, 뒤로 가면 줄어든다", () => {
    expect(nextDepth(0, "push")).toBe(1);
    expect(nextDepth(1, "pop")).toBe(0);
  });

  it("탭 이동은 쌓지 않는다", () => {
    expect(nextDepth(0, "replace")).toBe(0);
    expect(nextDepth(2, "replace")).toBe(2);
  });

  it("앱 밖에서 들어와 뒤로 가도 0 아래로 내려가지 않는다", () => {
    expect(nextDepth(0, "pop")).toBe(0);
  });
});
