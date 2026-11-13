// 화면(클라이언트)과 서버가 같이 쓰는 공부 기록 규칙. 서버 코드를 끌어오지 않게 따로 둔다

/** STUDY-01: 공부 시간은 5분 단위 */
export const MINUTE_STEP = 5;
/** 기록 한 건의 최대 공부 시간 (12시간) */
export const ENTRY_MAX_MINUTES = 12 * 60;
/** 하루 합계 최대 (24시간) */
export const DAY_MAX_MINUTES = 24 * 60;
/** STUDY-07: 기록 한 건에 사진 10장까지 */
export const PHOTO_MAX = 10;
/** 리사이즈한 사진 한 장 최대 크기 */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** 브라우저에서 이 형식으로 바꿔서 올린다 */
export const PHOTO_TYPE = "image/jpeg";

/** 90 → "1시간 30분", 0 → "0분" */
export function minutesText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
