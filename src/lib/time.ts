// 시간은 UTC로 저장하고 KST로 보여준다 (NFR-06)

const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 2026. 11. 12. 19:30 */
export function formatKst(date: Date) {
  return kst.format(date);
}
