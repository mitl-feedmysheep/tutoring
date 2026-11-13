import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 실행 파일 묶음
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        // 서비스 워커는 매번 새로 확인해야 고친 내용이 바로 반영된다
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
