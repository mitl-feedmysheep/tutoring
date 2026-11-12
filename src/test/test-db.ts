import "dotenv/config";

/** 테스트 DB 주소. 운영 DB를 실수로 쓰지 않도록 스키마 이름이 _test로 끝나야 한다 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL이 없습니다 (.env 또는 CI 시크릿)");
  const schema = new URL(url).pathname.replace(/^\//, "");
  if (!schema.endsWith("_test")) throw new Error(`테스트 DB 스키마는 _test로 끝나야 합니다: ${schema}`);
  return url;
}
