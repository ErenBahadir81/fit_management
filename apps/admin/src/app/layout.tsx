import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitFloow Admin",
  description: "FitFloow yönetim paneli",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
