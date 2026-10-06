import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OptiAxis Lab — SPH/CYL/AXIS Prototype",
  description: "Nguyên mẫu đo công suất và trục tròng kính bằng biến dạng lưới quang học.",
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
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
