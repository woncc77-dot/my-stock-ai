import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "원채 주식 AI 대시보드",
  description: "Gemini AI 기반 국내 주식 분석 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-canvas font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
