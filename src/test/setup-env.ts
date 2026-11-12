import { testDatabaseUrl } from "./test-db";

// 각 테스트 파일이 시작되기 전에 실행된다. 앱 코드가 읽는 DATABASE_URL을 테스트 DB로 바꾼다
process.env.DATABASE_URL = testDatabaseUrl();
