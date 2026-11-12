import { execSync } from "node:child_process";
import mariadb from "mariadb";
import { testDatabaseUrl } from "./test-db";

// 테스트 전체 시작 때 한 번: 마이그레이션을 적용하고 테이블을 비운다
export default async function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  const conn = await mariadb.createConnection(url.replace(/^mysql:\/\//, "mariadb://"));
  try {
    const schema = new URL(url).pathname.slice(1);
    const rows: { name: string }[] = await conn.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_name <> '_prisma_migrations'",
      [schema],
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of rows) await conn.query(`TRUNCATE TABLE \`${name}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
}
