import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "روزبانی — سیستم هوشمند برنامه‌ریزی و اپلای دکتری",
  description: "برنامه‌ریزی شمسی، عامل عملیاتی، مدیریت پژوهش، اپلای دکتری، زبان و مهاجرت روی Cloudflare.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
