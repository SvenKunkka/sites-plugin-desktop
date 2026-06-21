import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STEP/STP 批量转 STL",
  description: "在浏览器本地批量把 STEP 和 STP CAD 文件转换成 STL 文件。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
