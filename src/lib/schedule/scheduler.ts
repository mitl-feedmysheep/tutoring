import { kstParts } from "./kst";
import { runMonthlyGeneration } from "./job";

// Next.js 프로세스 안에서 1분마다 도는 스케줄러 (요구사항 5장). 알림 발송은 5단계에서 여기에 붙인다

const INTERVAL_MS = 60_000;
let started = false;
let running = false;
/** 월 생성을 모두 성공한 KST 날짜. 같은 날에는 다시 돌지 않는다 */
let generatedOn: string | undefined;

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const p = kstParts(now);
    const today = `${p.year}-${p.month}-${p.day}`;
    if (generatedOn !== today) {
      const results = await runMonthlyGeneration(now);
      if (results.every((r) => r.ok)) generatedOn = today;
    }
  } catch (e) {
    console.error("[schedule] 스케줄러 오류", e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  void tick();
  setInterval(tick, INTERVAL_MS).unref();
}
