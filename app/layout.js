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

// ── Metadata séparée du viewport (Next.js 16 recommandation) ──
export const metadata = {
  title: "FORGE — Fitness Tracker",
  description: "App de tracking fitness avec IA intégrée",
  manifest: "/manifest.json",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FORGE",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
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
