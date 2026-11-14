import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NavProgress } from "@/components/app/nav-progress";
import { NavTracker } from "@/components/app/nav";
import { ServiceWorkerRegister } from "@/components/app/service-worker";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Tutoring",
    template: "%s | Tutoring",
  },
  description: "영어 말하기 과외",
  // 아이폰 홈 화면 앱: 이름, 주소창 없이 열기 (NFR-05). 아이콘은 app/apple-icon.png
  appleWebApp: {
    capable: true,
    title: "Tutoring",
    statusBarStyle: "default",
  },
};

// 인투디헤븐 웹앱과 같이 앱처럼 쓰도록 확대를 막는다 (입력칸을 누를 때 화면이 커지는 것도 막힘)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 아이폰 노치·홈 바 영역까지 화면을 쓰고, 그 여백은 safe-area-inset으로 비운다
  viewportFit: "cover",
  themeColor: "#fcfcfa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 폰트. 인투디헤븐 웹앱과 같은 Pretendard (쓰는 글자만 받는 dynamic subset) */}
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className={`${geistMono.variable} antialiased`}>
        <NavTracker />
        <NavProgress />
        <ServiceWorkerRegister />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
