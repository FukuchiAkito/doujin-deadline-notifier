import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "同人誌締切監視",
  description: "同人誌印刷所の締切と進捗を管理するサービス",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
