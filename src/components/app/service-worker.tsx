"use client";

import { useEffect } from "react";

// 서비스 워커(public/sw.js) 등록. 화면에는 아무것도 그리지 않는다.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("service worker register failed", err));
  }, []);
  return null;
}
