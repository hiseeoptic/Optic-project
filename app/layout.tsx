import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kính 3D & AI Studio",
  description: "Dựng kính 3D theo kích thước thật, virtual try-on, đo PD và phân tích tròng kính.",
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
