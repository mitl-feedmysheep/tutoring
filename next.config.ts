import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 실행 파일 묶음
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
