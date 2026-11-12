import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

// 범위 없는 원본 클라이언트. 기능 코드는 이걸 직접 쓰지 않고 scope.ts의 teacherDb/studentDb를 쓴다.
// 예외: 로그인·초대 토큰 확인처럼 아직 선생님을 모르는 단계, 선생님 계정 스크립트, 월간 일정 생성 같은 시스템 작업.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 없습니다");
  // mariadb 드라이버는 mariadb:// 주소를 받는다. 값은 Prisma CLI와 같이 mysql://로 둔다
  const adapter = new PrismaMariaDb(url.replace(/^mysql:\/\//, "mariadb://"));
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
