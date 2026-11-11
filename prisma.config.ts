import "dotenv/config";
import { defineConfig } from "prisma/config";

// 로컬에서는 .env, 운영에서는 Doppler가 DATABASE_URL을 넣는다.
// prisma generate는 DB 접속이 필요 없어서, Docker 빌드처럼 값이 없을 때도 동작하게 env()가 아닌 process.env를 쓴다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
