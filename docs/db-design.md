# DB 설계

요구사항(`docs/requirements.md`)을 테이블로 옮긴 것. 스키마가 바뀌면 이 문서도 같이 고친다.

- 최초 작성: 2026-11-11
- 2026-11-11 1차 검수: 공부 기록 통합, 파일 테이블 통합, 게시판 이름 변경, 선생님 고정 시간 추가
- 2026-11-11 2차 검수: invite 복구(링크 취소), 월 단위 일괄 생성, booking → lesson, 자료 학생별 공개
- 2026-11-11 3차 검수: 고정 일정 변경 규칙 정리
- 2026-11-11 4차 검수: 적용 기간 칸 제거 → 행을 바로 고침. 선생님이 학생 일정을 바꾸면 알림
- 2026-11-11 5차 검수: 고정 일정 변경 이력, 선생님 변경 사유
- 2026-11-11 6차 검수: 이력을 `schedule_change` 하나로 통합(수업 1회 + 고정 일정), 모든 테이블 소프트 삭제
- 2026-11-11 7차 검수: 학생 비활성화·삭제 때 이메일 뒤에 표시를 붙여 같은 이메일로 새 가입 허용
- 2026-11-12: 월 단위 생성 기록 `monthly_slot_history` 추가
- 2026-11-13: 알림 발송 기록 `notification_log` 추가

---

## 1. 공통 규칙

| 항목 | 규칙 | 이유 |
|---|---|---|
| DB | MySQL `tutoring` 스키마 (`local-mysql`, 3306), InnoDB, utf8mb4 | 기존 서버에 별도 스키마 |
| 이름 | 테이블·컬럼은 snake_case, Prisma 모델은 PascalCase + camelCase (`@@map`, `@map`) | DB는 SQL 관례, 코드는 TS 관례 |
| PK | 모든 테이블 `id CHAR(36)` UUID v7 (`@default(uuid(7))`) | 순번 노출 방지 + 시간순 정렬 가능 |
| 시간 | `DATETIME(3)` UTC 저장, 화면에서 KST로 표시 (NFR-06) | 아래 "시간대" 참고 |
| 날짜 | 공부 날짜·납부 월처럼 "KST 기준 날짜"는 `DATE` | 시각이 아니라 달력의 날짜라서 |
| 주간 규칙 | 고정 시간은 KST 요일 + 자정부터 분 | "매주 화 19시"는 벽시계 규칙이라서 |
| 공통 컬럼 | **모든 테이블** `id`, `created_at`, `updated_at`, `deleted_at` | 아래 표에서는 생략 |
| 삭제 | **소프트 삭제**. 아래 "소프트 삭제" 참고 | |

### 시간대

- MySQL은 시간대를 **스키마별로 둘 수 없다**. 서버 전체(global) 또는 접속별(session) 설정만 있다.
- 접속별 설정도 `DATETIME` 컬럼에는 영향이 없다. 넣은 값을 그대로 돌려준다. (`TIMESTAMP` 컬럼만 접속 시간대로 바꿔서 보여줌. 직접 확인함)
- Prisma는 시각을 항상 UTC로 읽고 쓴다. KST로 저장하려면 앱 전체에서 9시간을 직접 더하고 빼야 해서 실수하기 쉽다.
- 그래서 **UTC 저장, 화면 표시만 KST**. DB 도구에서 KST로 보고 싶을 때는 `CONVERT_TZ(starts_at, '+00:00', '+09:00')`로 조회한다.

### 소프트 삭제

- 삭제는 `deleted_at`에 시각을 넣는 것. 실제로 행을 지우지 않는다.
- **읽을 때 `deleted_at IS NULL`을 자동으로 건다.** `teacher_id` 범위를 거는 공통 계층(Prisma 확장)에서 같이 처리해서, 쿼리마다 빼먹을 수 없게 한다. 테스트로 확인한다.
- **자식도 같이 삭제 표시**: DB의 연쇄 삭제(CASCADE)는 실제 삭제에만 동작하므로, 공부 기록을 지우면 사진도, 게시글을 지우면 댓글도 앱에서 같은 트랜잭션으로 표시한다.
- **UNIQUE와 충돌**: 지운 행도 남아 있으므로 같은 값을 다시 만들면 UNIQUE에 걸린다. 다시 만들 때는 새 행 대신 지운 행을 되살린다(`deleted_at = NULL`).
  - 예: 납부 체크를 풀었다가 다시 체크, 자료 공개를 거뒀다가 다시 공개
  - 학생 이메일: 아래 student 참고 (비활성화·삭제 때 이메일 뒤에 표시를 붙여 비움)
- **상태 컬럼과의 구분**: `deleted_at`은 "없는 것으로 친다". 아래는 남아서 보여야 하는 상태라 따로 둔다.
  - `lesson.canceled_at`: 취소된 수업도 수업 이력에 "취소"로 보인다
  - `student.deactivated_at`: 비활성 학생도 기록은 볼 수 있다
  - `invite.revoked_at`: 취소한 링크도 목록에 보인다
- R2 파일은 소프트 삭제해도 지우지 않는다. 정리가 필요해지면 그때 배치 작업을 만든다.

### 접속과 마이그레이션

| 항목 | 값 |
|---|---|
| 스키마 | `tutoring` (utf8mb4, utf8mb4_0900_ai_ci. into-the-heaven과 같음) |
| 마이그레이션 검증용 | `tutoring_shadow` (`prisma migrate dev`가 쓰는 빈 스키마) |
| 계정 | `tutoring`@`%`. 위 두 스키마에만 권한 |
| 로컬 접속 | `.env`의 `DATABASE_URL` (git 제외) |
| 앱 컨테이너 접속 | `mysql://tutoring:...@host.docker.internal:3306/tutoring` (Doppler prd) |
| Prisma | 7.10.1, 생성 코드 `src/generated/prisma` (git 제외, 빌드 때 생성) |
| 테스트 DB | test-mysql 컨테이너(:3307)의 `tutoring_test`, 계정 `tutoring_test`. 로컬 `.env`와 GitHub 시크릿의 `TEST_DATABASE_URL` |

- 스키마 변경: `prisma/schema.prisma` 수정 → `npm run db:migrate -- --name 이름` → 생성된 SQL 확인 후 커밋
- 개발 환경이 따로 없으므로 마이그레이션은 이 Mac mini에서 운영 DB에 바로 적용된다. 컬럼 삭제처럼 되돌리기 어려운 변경은 SQL을 먼저 확인한다.
- Prisma가 표현하지 못하는 제약(`schedule_change`의 CHECK)은 마이그레이션 SQL에 직접 적는다.

## 2. 격리 규칙 (NFR-01, NFR-02)

1. 선생님 소유 테이블은 모두 `teacher_id`를 가진다.
2. 부모 테이블에 `UNIQUE (teacher_id, id)`를 두고, 자식은 **복합 외래키** `(teacher_id, xxx_id) → 부모(teacher_id, id)`로 연결한다.
   → 다른 선생님의 학생·슬롯을 참조하는 행은 DB가 거부한다.
3. 앱은 세션의 `teacher_id`와 `deleted_at IS NULL`이 자동으로 걸리는 계층을 통해서만 DB에 접근한다.
4. 테이블마다 다른 선생님 데이터 접근 차단 테스트를 둔다.

### 범위 계층 (`src/lib/db/scope.ts`)

기능 코드는 세션 값으로 `teacherDb(teacherId)` 또는 `studentDb(teacherId, studentId)`를 만들어 쓴다. 범위 없는 `src/lib/db/client.ts`는 DB 계층, 인증(로그인·초대 토큰 확인), 스크립트, 테스트에서만 쓴다 (ESLint로 막음).

| | 선생님 범위 | 학생 범위 |
|---|---|---|
| 조회 | 그 선생님 행, 지운 행 제외 | 위 + 본인 것만. 슬롯·고정 시간은 함께 봄. 초대 링크는 안 보임 |
| 수업 노트 | 전부 | `author = 'STUDENT'`이고 본인 수업 |
| 공부 기록 | 전부 (본인 기록 포함) | 본인 것 (선생님 본인 기록 제외) |
| 파일 | 전부 | 본인이 올린 사진 + 본인에게 공개된 자료 |
| 만들기 | `teacher_id` 자동 | 위 + `student_id`, `author = STUDENT` 등 자동. 연결하는 수업·글·공부 기록이 본인 것인지 확인 |
| 쓰기 가능 | 전부 (선생님 계정 생성 제외) | 본인 정보, 고정 일정, 수업, 일정 변경, 학생 노트, 공부 기록, 사진, 게시판 글·댓글 |

- include/select로 딸려오는 목록과 `_count`에도 같은 조건이 붙는다.
- 범위 값과 다른 `teacher_id`·`student_id`를 넣거나 바꾸려 하면 오류.
- `delete`는 막혀 있다. 소프트 삭제는 `update`로 `deletedAt`을 넣는다.
- 관계 필드로 중첩 쓰기(`photos: { create }`, `connect`)는 막혀 있다. id 값으로 연결한다.
- 직접 챙길 것: where 안의 관계 조건(`some`, `every`)에는 `deletedAt: null`을 넣는다. SQL 직접 실행(`$queryRaw`)은 쓰지 않는다.
- 스키마에 관계를 추가하면 `RELATIONS`도 고친다. 안 고치면 테스트가 실패한다.

**정규화와의 관계**: 자식의 `teacher_id`는 부모를 따라가면 알 수 있어서 3정규형 기준으로는 중복이다. 일부러 둔 것이다. 복합 외래키 때문에 부모와 다른 값은 들어갈 수 없어서 불일치는 생기지 않고, 대신 모든 쿼리에 `WHERE teacher_id = ?` 한 줄로 범위를 걸 수 있다.

## 3. 일정 흐름

```
[선생님] weekly_slot  매주 화 19:00~20:00
            │  매달 마지막 날, 다음 달 날짜마다 생성
            ▼
         slot          11/4(화) 19:00, 11/11(화) 19:00, ...   ← 같은 시간 학생들이 공유 (Meet 링크도 여기)
            │
[학생]   weekly_lesson 김철수: 화 19:00 고정
            │  slot이 생길 때 같이 생성
            ▼
         lesson        김철수의 11/4 수업, 김철수의 11/11 수업, ...
            │
            ├─ lesson_note      그 수업의 선생님 노트 / 학생 노트
            └─ schedule_change  그 수업이 취소·변경된 이력
```

- **매달 마지막 날(KST)** 에 다음 달 전체를 만든다: 삭제되지 않은 선생님 고정 시간 → slot, 삭제되지 않은 학생 고정 일정 → lesson. 스케줄러(`src/lib/schedule/scheduler.ts`)가 1분마다 확인하고, 만든 달은 `monthly_slot_history`에 남겨 한 달에 한 번만 만든다.
- 마지막 날 서버가 꺼져 있어서 놓쳤으면, 다음 달 초에 그 달을 만든다 (지난 달 기록은 있는데 이번 달 기록이 없을 때). 이미 지난 시각의 슬롯은 만들지 않는다.
- 월 중간에 고정 시간이나 고정 일정을 새로 등록하면 이번 달 남은 날짜와 (이미 생성됐으면) 다음 달까지 바로 만든다.
- 생성은 한 달에 한 번이라 선생님이 지운 slot이나 학생이 취소한 lesson은 다시 생기지 않는다.
- `UNIQUE (weekly_slot_id, starts_at)`, `UNIQUE (slot_id, student_id)`로 두 번 실행돼도 중복이 생기지 않는다. 지운 행도 UNIQUE에 걸리므로 선생님이 지운 날은 다시 생기지 않는다.
- 이때 선생님이 지운 고정 시간 때문에 고정 일정이 만들어지지 못한 학생에게 알림을 보낸다 (NOTI-06). 화·목 중 목요일만 없어져도 보낸다.

### 고정 시간·고정 일정 바꾸기

이번 달 수업은 이미 만들어져 있으므로, 고정 시간이나 고정 일정 행을 바로 고치면 다음 생성부터 반영된다.

| 누가 | 무엇을 | 처리 | 이력 (schedule_change) |
|---|---|---|---|
| 학생·선생님 | 수업 1회 취소 | lesson `canceled_at` | lesson_id, CANCEL |
| 학생·선생님 | 수업 1회 옮기기 ("이번만") | 기존 lesson 취소 + 새 lesson | 기존 lesson_id, MOVE, 전·후 |
| 학생·선생님 | 고정 일정 "앞으로 전부" | weekly_lesson의 weekly_slot_id를 바꾸고, 이미 만들어진 앞으로의 lesson은 취소 + 새 시간 lesson 생성 (학생은 1시간 안 수업 제외) | weekly_lesson_id, CHANGE, 전·후 (수업마다가 아니라 한 줄) |
| 선생님 | 위의 모든 경우 | 사유 필수 + 학생 알림 (NOTI-07, 사유 포함) | reason |
| 선생님 | 고정 시간 변경·삭제, 학생 없음 | 바로 반영. 앞으로의 빈 slot(취소되지 않은 수업이 없는 slot)은 지우고, 변경이면 새 시간으로 다시 만든다. 예약이 있는 slot은 그대로 둔다. 변경은 기존 weekly_slot을 지우고 새 행을 만든다 (같은 행을 고치면 지운 slot과 시작 시각이 겹쳐 다시 만들어지지 않을 수 있어서) | 없음 |
| 선생님 | 고정 시간 변경, 학생 있음 | weekly_slot 시간만 고침 → 다음 달 생성부터 새 시간. 학생 고정 일정도 자동으로 따라감. 알림 없음, 사유 필수 | 학생마다 weekly_lesson_id, CHANGE |
| 선생님 | 고정 시간 삭제, 학생 있음 | weekly_slot `deleted_at`. 다음 달부터 생성 안 됨. 월말 생성 때 학생 알림 (NOTI-06) 후 학생 weekly_lesson도 `deleted_at` | 학생마다 weekly_lesson_id, REMOVE, SYSTEM |

- 주의: 월말 생성(마지막 날 00:00)이 끝난 뒤 같은 날 고치면 다음 달은 이미 만들어져 있으므로 그 다음 달부터 반영된다. 화면에서 안내한다.

## 4. 테이블 (17개)

공통 컬럼(`id`, `created_at`, `updated_at`, `deleted_at`)은 표에서 생략한다.

### teacher (선생님 = 테넌트)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| name | VARCHAR(50) | |
| email | VARCHAR(100) UNIQUE | 로그인 ID |
| password_hash | VARCHAR(100) | bcrypt |
| must_change_password | BOOLEAN | 어드민에서 임시 비밀번호로 만든 계정은 첫 로그인 때 변경 |
| session_version | INT | 비밀번호 변경·초기화 때 +1 → 기존 로그인 무효화 |
| is_admin | BOOLEAN | 시스템 관리자. 다른 선생님 계정을 만든다 (ADMIN-05) |

### student

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK → teacher | AUTH-04 |
| name | VARCHAR(50) | |
| birth_year | SMALLINT | |
| gender | ENUM('MALE','FEMALE') | |
| email | VARCHAR(150) UNIQUE | 전체에서 유일. 비활성화·삭제 때 뒤에 표시를 붙임 (아래) |
| password_hash | VARCHAR(100) | |
| must_change_password | BOOLEAN | AUTH-07, 08 |
| session_version | INT | |
| occupation | VARCHAR(100) NULL | 선생님이 입력 (AUTH-05) |
| deactivated_at | DATETIME NULL | 비활성화 (ADMIN-04). 로그인·예약 차단, 기록은 보임 |

- `UNIQUE (teacher_id, id)`
- 가입 때 teacher 이메일과도 겹치지 않는지 확인 (로그인 화면 하나)
- **비활성화·삭제할 때 이메일 비우기**: `kim@gmail.com` → `kim@gmail.com_deleted_1794384000000` (뒤는 그 시각의 밀리초 타임스탬프)
  - 같은 이메일로 새 초대 링크를 받아 가입하면 새 계정으로 만들어진다. 예전 계정의 기록은 예전 계정에 남는다.
  - 예전 계정을 다시 활성화하면 뒤의 표시를 떼서 원래 이메일로 돌린다. 그 이메일로 이미 새 계정이 있으면 다시 활성화를 막고 안내한다.
  - 길이: 이메일 100자 + 표시 최대 23자라서 컬럼을 150자로 둔다. 가입 때 이메일은 100자로 제한한다.

### invite (초대 링크)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| token_hash | CHAR(64) UNIQUE | 링크에는 원본 토큰, DB에는 SHA-256만 저장 |
| memo | VARCHAR(50) NULL | 누구에게 보낸 링크인지 |
| expires_at | DATETIME | 발급 + 1시간 |
| revoked_at | DATETIME NULL | 선생님이 링크 취소 (AUTH-09) |
| used_at | DATETIME NULL | 1회용 |
| student_id | CHAR(36) NULL | 복합 FK → student. 이 링크로 가입한 학생 |

- 사용 가능 조건: `used_at IS NULL AND revoked_at IS NULL AND expires_at > now`
- 가입 처리는 한 트랜잭션에서 `used_at` 조건부 UPDATE가 1행일 때만 학생 생성 → 동시에 두 번 눌러도 한 명만 가입

### weekly_slot (선생님 고정 수업 시간)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| weekday | TINYINT | 0=일 ~ 6=토, KST |
| start_minute, end_minute | SMALLINT | KST 자정부터 분 (19:00 = 1140) |

- `UNIQUE (teacher_id, id)`
- 같은 요일·시간이 겹치지 않는지는 앱에서 검사 (지운 행이 남아서 UNIQUE로는 못 막음)
- 학생 일정 화면: 연결된 weekly_slot이 지워졌으면 "다음 달부터 이 고정 시간이 없어져요" 안내

### slot (그 날의 수업 시간 한 칸)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| weekly_slot_id | CHAR(36) NULL | 복합 FK → weekly_slot. NULL = 1회성 슬롯 (SCH-12) |
| starts_at, ends_at | DATETIME | UTC |

- `UNIQUE (teacher_id, id)`, `UNIQUE (weekly_slot_id, starts_at)`, `INDEX (teacher_id, starts_at)`
- 1:다 수업에서 학생들이 공유하는 단위. 참여 학생 수 표시(SCH-02), Meet 링크(6단계)가 여기 붙는다.
- 특정 날 휴강 = 그 slot 삭제. 연결된 lesson도 같이 삭제 표시하고 학생에게 알림 (SCH-10). 이미 시작했거나 지난 slot은 삭제 막음.
- 선생님 slot끼리 시간이 겹치지 않게 앱에서 검사한다 (1회성 slot 추가 때, 같은 요일 고정 시간끼리) (SCH-18).

### monthly_slot_history (월 단위 생성 기록)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| month | DATE | 그 달 1일. 행이 있으면 그 달은 이미 만들었다 |

- `UNIQUE (teacher_id, month)`. 월말 생성이 두 번 돌거나 동시에 돌아도 한 번만 만든다.
- 생성을 다시 돌리면 안 되는 이유: 학생이 있는 고정 시간을 바꾸면 이번 달은 옛 시간 그대로 둬야 하는데, 다시 돌리면 새 시간 slot이 이번 달에 생긴다.
- 고정 시간을 새로 등록할 때 다음 달 기록이 있으면 다음 달 slot까지 바로 만든다.
- 학생은 볼 수 없다.

### weekly_lesson (학생 고정 일정)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | |
| student_id | CHAR(36) | 복합 FK → student |
| weekly_slot_id | CHAR(36) | 복합 FK → weekly_slot. 선생님 고정 시간 중에서 고른다 |

- `UNIQUE (teacher_id, id)`, `INDEX (student_id)`

### lesson (학생 1명의 그 날 수업 1회)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | |
| slot_id | CHAR(36) | 복합 FK → slot. 날짜·시간은 slot에 있음 |
| student_id | CHAR(36) | 복합 FK → student |
| weekly_lesson_id | CHAR(36) NULL | 복합 FK → weekly_lesson. 고정 일정으로 만들어진 경우 |
| attendance | ENUM('COMPLETED','ABSENT') NULL | LESSON-01. NULL = 미체크 |
| canceled_at | DATETIME NULL | 취소. 누가·왜는 schedule_change |

- `UNIQUE (slot_id, student_id)`, `UNIQUE (teacher_id, id)`
- 날짜를 lesson에 따로 두지 않는 이유: 같은 시간 수업을 듣는 학생들이 slot 하나를 공유하므로, 복사해두면 slot 시간을 바꿀 때 어긋날 수 있다.
- 학생은 앞으로의 slot이면 언제든 예약·취소·변경 (SCH-13). 1시간 전 규칙과 지난 수업 변경 금지는 앱에서 검사. 선생님은 1시간 규칙 없이 바꿀 수 있다 (지난 수업은 불가).

### schedule_change (일정 변경 이력, SCH-16, SCH-17)

수업 1회 변경이든 고정 일정 변경이든 한 곳에 남긴다. 학생 카드의 "일정 변경 이력"은 이 테이블 하나만 읽으면 된다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | |
| student_id | CHAR(36) | 복합 FK → student |
| lesson_id | CHAR(36) NULL | 복합 FK → lesson. 수업 1회 취소·옮기기일 때 |
| weekly_lesson_id | CHAR(36) NULL | 복합 FK → weekly_lesson. 고정 일정 변경일 때 |
| action | ENUM('ADD','CANCEL','MOVE','CHANGE','REMOVE') | 수업: CANCEL, MOVE / 고정 일정: ADD, CHANGE, REMOVE |
| before_text | VARCHAR(50) NULL | 바뀌기 전. 예: "11/11(화) 19:00", "매주 화 19:00~20:00" |
| after_text | VARCHAR(50) NULL | 바뀐 뒤 |
| changed_by | ENUM('STUDENT','TEACHER','SYSTEM') | SYSTEM = 선생님 고정 시간 삭제로 월말에 끝남 |
| reason | VARCHAR(200) NULL | 선생님이 바꿀 때 필수 |

- `INDEX (teacher_id, student_id, created_at)`, `INDEX (lesson_id)`
- `lesson_id`와 `weekly_lesson_id` 중 정확히 하나만 채운다 (CHECK 제약 + 앱 검사)
- 고정 일정을 "앞으로 전부" 바꾸면 수업 8개가 바뀌어도 이력은 weekly_lesson에 한 줄. 수업마다 남기면 같은 사유가 8번 반복되고, 아직 만들어지지 않은 다음 달 수업에는 붙일 곳이 없어서.
- 전·후를 ID가 아니라 글자로 남기는 이유: weekly_slot 시간은 그 자리에서 고치므로 ID만 남기면 원래 시간을 알 수 없다. 이력은 보여주기만 하므로 글자로 충분하다.

### lesson_note (수업 노트)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id, lesson_id | | 복합 FK → lesson |
| author | ENUM('TEACHER','STUDENT') | |
| content | TEXT | |

- `UNIQUE (lesson_id, author)` — 수업 1회마다 선생님 노트 1개, 학생 노트 1개 (지웠다 다시 쓰면 되살림)
- 학생 조회는 항상 `author = 'STUDENT'`. 범위 계층(`studentDb`)과 테스트로 강제.

### study_log (공부 기록, 학생 + 선생님 본인)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| student_id | CHAR(36) NULL | 복합 FK → student. **NULL = 선생님 본인 기록** (STUDY-08) |
| study_date | DATE | KST 날짜 |
| minutes | SMALLINT | 5분 단위 (앱에서 검사) |
| memo | TEXT NULL | |

- `UNIQUE (teacher_id, id)`, `INDEX (teacher_id, student_id, study_date)`
- 하루 여러 건. 선생님 "내 기록" = `student_id IS NULL`, 학생 화면 = `student_id = 본인`.

### file (업로드 파일: 공부 사진, 자료실 PDF)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) FK | |
| uploader_student_id | CHAR(36) NULL | 복합 FK → student. NULL = 선생님이 올림 |
| kind | ENUM('STUDY_PHOTO','MATERIAL') | |
| study_log_id | CHAR(36) NULL | 복합 FK → study_log |
| file_name | VARCHAR(200) | 원본 파일명. 자료실 목록에 표시 |
| r2_key | VARCHAR(200) | `teachers/{teacherId}/{kind}/{id}.{ext}` |
| content_type | VARCHAR(100) | |
| size_bytes | INT | |
| sort_order | TINYINT | 사진 순서 (최대 10장) |

- `UNIQUE (teacher_id, id)`, `INDEX (teacher_id, kind, created_at)`, `INDEX (study_log_id)`
- 공부 사진: 학생이 공부 기록에 첨부. 그 선생님은 언제든 볼 수 있다.
- 자료: 선생님이 어드민 자료실에 올림. 처음엔 아무에게도 안 보이고 file_access로 공개한다.
- 인투디헤븐 media의 `entity_type` + `entity_id` 방식은 외래키를 못 걸어 격리가 빠지므로, 붙는 대상은 실제 컬럼으로 둔다.

### file_access (자료 학생별 공개, FILE-03)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | |
| file_id | CHAR(36) | 복합 FK → file |
| student_id | CHAR(36) | 복합 FK → student |

- `UNIQUE (file_id, student_id)`. 공개를 거두면 삭제 표시, 다시 공개하면 되살림.
- 학생 자료실 = 자기에게 공개된 MATERIAL만.

### payment (과외비 납부)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id, student_id | | 복합 FK → student |
| month | DATE | 그 달 1일 |
| paid_at | DATETIME | 체크한 시각 |

- `UNIQUE (student_id, month)`. 체크를 풀면 삭제 표시, 다시 체크하면 되살림.

### board (게시판 글), comment (댓글)

board

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id, student_id | | 복합 FK → student. 이 둘만 봄 |
| author | ENUM('TEACHER','STUDENT') | |
| title | VARCHAR(100) | |
| content | TEXT | |

- `UNIQUE (teacher_id, id)`

comment

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id, board_id | | 복합 FK → board |
| author | ENUM('TEACHER','STUDENT') | |
| content | TEXT | |

### push_subscription (웹 푸시 구독, APP-12, APP-18)

인투디헤븐 `push_subscription`(member_id, endpoint, p256dh, auth, user_agent, created_at)과 같은 구조에 선생님 범위와 소프트 삭제를 더했다. 시간대 칼럼은 없다 (모두 KST).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | FK → teacher |
| student_id | CHAR(36) NULL | 복합 FK → student. NULL = 선생님 본인 기기 |
| endpoint | VARCHAR(768) | 기기 푸시 주소 |
| p256dh, auth | VARCHAR(255) | 알림 암호화 키 |
| user_agent | VARCHAR(500) NULL | 어떤 기기인지 (문제 확인용) |

- `UNIQUE (endpoint)`: 기기 하나에 한 행. 같은 기기에서 다른 사람이 켜면 행의 주인을 옮긴다 (`src/lib/db/push.ts`, 범위 계층 밖에서 쓰는 유일한 곳).
- 끄기·로그아웃·없어진 구독(404/410)은 삭제 표시. 다시 켜면 되살림.
- 학생 범위는 본인 기기만, 선생님 범위는 자기 학생 기기 + 본인 기기.

### notification_log (알림 발송 기록, NOTI)

보낸 알림을 남긴다. 같은 알림을 두 번 보내지 않는 데 쓴다. 스케줄러는 매분 "보낼 때가 지났는데 기록이 없는 것"을 찾아 보내므로, 배포로 잠깐 멈춰도 다시 뜨면 늦게라도 보낸다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| teacher_id | CHAR(36) | FK → teacher |
| kind | ENUM | 알림 종류. `LESSON_REMINDER`(NOTI-01), `SCHEDULE_CHANGED`(NOTI-02), `SLOT_DELETED`(NOTI-03), `STUDY_MISSING`(NOTI-04), `BOARD`(NOTI-05), `WEEKLY_MISSING`(NOTI-06), `TEACHER_CHANGED`(NOTI-07) |
| target_key | VARCHAR(100) | 무엇에 대한 알림인지. 예: 슬롯 id, `학생id:2026-11-13`, 댓글 id |
| recipient | VARCHAR(36) | 받는 사람. 학생 id, 선생님이면 `TEACHER` |

- `UNIQUE (teacher_id, kind, target_key, recipient)`: 보내기 전에 행을 넣고, 이미 있으면(중복 오류) 보내지 않는다. 기록이 쌓여도 이 인덱스로 바로 확인한다.
- `recipient`는 외래키가 아니다. 선생님을 NULL로 두면 UNIQUE가 NULL끼리 중복을 막지 못해서 문자열로 둔다.
- 오래된 기록 정리는 필요해지면 그때 만든다.

## 5. 나중 단계에서 추가할 것

| 단계 | 추가 |
|---|---|
| 5단계 알림 | `notification_log` (스케줄러 중복 발송 막기, 필요하면) |
| 6단계 Meet | teacher: 구글 리프레시 토큰(암호화). slot: `google_event_id`, `meet_url` |
