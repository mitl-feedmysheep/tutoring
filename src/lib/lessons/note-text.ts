// 화면(클라이언트)과 서버가 같이 쓰는 노트 규칙. 서버 코드를 끌어오지 않게 따로 둔다

/** NOTE-05: 노트 하나의 최대 글자 수 */
export const NOTE_MAX = 5000;

/** 줄바꿈을 맞추고, 내용 없는 글머리 줄("- ")과 앞뒤 빈 줄을 뺀다. 빈 문자열이면 노트가 없는 것 */
export function cleanNote(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !/^\s*-$/.test(l))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}
