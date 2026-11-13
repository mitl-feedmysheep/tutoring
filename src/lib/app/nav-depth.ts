// 웹앱 안에서 몇 번 화면을 쌓았는지 센다 (APP-07, APP-08).
// 하위 화면의 ← 버튼은 쌓인 화면이 있으면 뒤로 가고, 없으면(알림으로 바로 들어온 경우 등) 그 화면이 속한 탭으로 간다.
// 아이폰 홈 화면 앱은 앱 밖으로 나가는 뒤로 가기가 없으므로, 앱 안 기록이 없는데 history.back()을 부르면 안 된다.

export type NavKind = "push" | "replace" | "pop";

/** steps: pop일 때 한 번에 몇 화면 돌아갔는지 (history.go(-n)) */
export function nextDepth(depth: number, kind: NavKind, steps = 1) {
  if (kind === "push") return depth + 1;
  if (kind === "pop") return Math.max(0, depth - steps);
  return depth; // 탭 이동, ← 버튼의 탭 이동은 기록을 쌓지 않는다
}
