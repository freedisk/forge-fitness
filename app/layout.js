import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "FORGE — Fitness Tracker",
  description: "App de tracking fitness avec IA intégrée",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

// Layout principal — Server Component, fond dark, Geist font
export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: '#0a0a0a', color: '#f0f0f0', fontFamily: 'var(--font-geist-sans), sans-serif' }}
      >
        <main style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
