// 서비스 워커. 홈 화면 앱 설치와 웹 푸시용이다.
// 화면·데이터를 저장해 두지 않는다 (fetch 처리 없음): 로그인한 화면이 기기에 남거나 옛 화면이 보이지 않게.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// 서버가 보내는 내용: { title, body?, url? }
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Tutoring", {
      body: data.body,
      icon: "/icon-192.png",
      // badge(상태 표시줄의 작은 아이콘)는 단색 그림이어야 해서 넣지 않는다. 컬러 아이콘을 넣으면 안드로이드에서 흰 네모로 보인다
      data: { url: data.url || "/" },
    }),
  );
});

// 알림을 누르면 열려 있는 앱 창을 그 화면으로 옮기고, 없으면 새로 연다
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
          return client.navigate(url).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
