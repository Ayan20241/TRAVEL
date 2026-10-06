import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TourFlow AI — Personalized Dynamic Tour Planning",
  description: "Plan, price, book, and adapt your trips dynamically. Operator console included.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-ink-900 antialiased">
        {children}
      </body>
    </html>
  );
}
