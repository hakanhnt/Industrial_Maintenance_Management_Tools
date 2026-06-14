import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-First Bakım Yönetimi Rehberi",
  description: "Kaynak dokümanlara dayalı çok ajanlı bakım yönetimi eğitim platformu."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
