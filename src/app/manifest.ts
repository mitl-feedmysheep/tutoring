import type { MetadataRoute } from "next";

// 홈 화면에 추가하면 주소창 없는 앱처럼 열린다 (NFR-05)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tutoring",
    short_name: "Tutoring",
    description: "영어 말하기 과외",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcfcfa",
    theme_color: "#fcfcfa",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
