// 화면(클라이언트)과 서버가 같이 쓰는 게시판 규칙. 서버 코드를 끌어오지 않게 따로 둔다

/** board.title VARCHAR(100) */
export const TITLE_MAX = 100;
export const CONTENT_MAX = 5000;
export const COMMENT_MAX = 2000;

/** 줄바꿈을 맞추고 앞뒤 공백을 뺀다 */
export function cleanText(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}
