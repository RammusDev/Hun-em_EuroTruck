import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hun-em｜歐洲旅途日記",
  description: "全黑貓、黃色圍巾，工作與旅行之間的四語日記。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <head><link rel="stylesheet" href="/access.css"/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
