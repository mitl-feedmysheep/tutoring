// 선생님 계정 생성 (처음 관리자 계정용. 이후 선생님은 어드민에서 만든다)
//
//   npm run teacher:create -- --name 이름 --email 메일 [--admin] [--temp]
//
// 비밀번호는 실행 후 입력한다 (명령 기록에 남지 않게). 파이프로 넘겨도 된다.
// --admin: 시스템 관리자, --temp: 임시 비밀번호라 첫 로그인 때 바꾸게 함
// 접속 DB는 .env의 DATABASE_URL (이 Mac mini에서는 운영 DB)
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createTeacher } from "../src/lib/auth/accounts";
import { prisma } from "../src/lib/db/client";

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").split("\n")[0].replace(/\r$/, "");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // 입력한 글자를 화면에 보이지 않게
  const out = rl as unknown as { _writeToOutput: (s: string) => void };
  const ask = async (q: string) => {
    process.stdout.write(q);
    out._writeToOutput = () => {};
    const v = await rl.question("");
    process.stdout.write("\n");
    return v;
  };
  const pw = await ask("비밀번호: ");
  const again = await ask("비밀번호 확인: ");
  rl.close();
  if (pw !== again) throw new Error("비밀번호가 서로 다릅니다");
  return pw;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      email: { type: "string" },
      admin: { type: "boolean", default: false },
      temp: { type: "boolean", default: false },
    },
  });
  if (!values.name || !values.email) throw new Error("--name, --email이 필요합니다");

  const teacher = await createTeacher({
    name: values.name,
    email: values.email,
    password: await readPassword(),
    isAdmin: values.admin,
    mustChangePassword: values.temp,
  });
  console.log("만들었습니다:", teacher);
}

main()
  .catch((e) => {
    console.error("실패:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
