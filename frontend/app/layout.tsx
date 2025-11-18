import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cylink - イベントライト制御システム",
  description: "スマホをライトに変えて、イベントを盛り上げる",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
