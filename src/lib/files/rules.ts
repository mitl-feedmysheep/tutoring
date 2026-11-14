// 화면(클라이언트)과 서버가 같이 쓰는 자료실 규칙. 서버 코드를 끌어오지 않게 따로 둔다

export const PDF_TYPE = "application/pdf";
/** 자료 PDF 한 개 최대 크기 */
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024;
/** file.file_name VARCHAR(200) */
export const FILE_NAME_MAX = 200;

/** "1.2MB", "340KB" */
export function sizeText(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** FILE-05: 자료 설명 최대 글자 수 */
export const DESCRIPTION_MAX = 2000;
