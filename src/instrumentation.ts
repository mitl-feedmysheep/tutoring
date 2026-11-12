// 서버가 시작될 때 한 번 실행된다. 스케줄러를 띄운다 (DISABLE_SCHEDULER=1이면 끔)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SCHEDULER === "1") return;
  const { startScheduler } = await import("@/lib/schedule/scheduler");
  startScheduler();
}
