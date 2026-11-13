import { kstParts } from "./kst";
import { runMonthlyGeneration } from "./job";
import { runScheduledNotifications } from "@/lib/notify/scheduled";
import { runScheduledMeetings } from "@/lib/meeting/meeting";

// Next.js 프로세스 안에서 1분마다 도는 스케줄러 (요구사항 5장): 월말 슬롯 생성, 시간 알림(수업 30분 전, 밤 11시 공부 기록), 수업 10분 전 Meet 링크(MEET-05)

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
    try {
      if (generatedOn !== today) {
        const results = await runMonthlyGeneration(now);
        if (results.every((r) => r.ok)) generatedOn = today;
      }
    } catch (e) {
      console.error("[schedule] 월 생성 오류", e);
    }
    // 월 생성이 실패해도 알림은 보낸다
    try {
      await runScheduledNotifications(now);
    } catch (e) {
      console.error("[notify] 알림 오류", e);
    }
    try {
      await runScheduledMeetings(now);
    } catch (e) {
      console.error("[meeting] Meet 링크 오류", e);
    }
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
