import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 범위 없는 DB 클라이언트는 DB 계층, 인증, 스크립트, 테스트에서만 쓴다. 기능 코드는 teacherDb/studentDb
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", "src/lib/auth/**", "src/test/**", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/db/client", message: "teacherDb/studentDb(@/lib/db/scope)를 쓰세요" },
            { name: "@/generated/prisma/client", importNames: ["PrismaClient"], message: "teacherDb/studentDb(@/lib/db/scope)를 쓰세요" },
          ],
          patterns: [{ group: ["**/lib/db/client"], message: "teacherDb/studentDb(@/lib/db/scope)를 쓰세요" }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma 생성 코드
    "src/generated/**",
  ]),
]);

export default eslintConfig;
