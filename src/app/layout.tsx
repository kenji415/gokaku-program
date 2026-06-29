import type { Metadata } from "next";
import { Shippori_Mincho } from "next/font/google";
import "./globals.css";

const programHeaderFont = Shippori_Mincho({
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-program-header",
});

export const metadata: Metadata = {
  title: "合格プログラム",
  description: "社内LAN向け 合格プログラム作成システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full ${programHeaderFont.variable}`}>
      <body className="min-h-full bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
