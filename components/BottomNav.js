'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Barre de navigation fixée en bas — 5 onglets + profil
const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/seance', label: 'Séance', icon: '⚡' },
  { href: '/historique', label: 'Historique', icon: '📋' },
  { href: '/exercices', label: 'Exercices', icon: '📖' },
  { href: '/stats', label: 'Stats', icon: '📊' },
  { href: '/profil', label: 'Profil', icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  // Ne pas afficher la nav sur la page login
  if (pathname === '/login') return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 text-xs transition-colors"
            style={{ color: isActive ? '#f97316' : '#777' }}
          >
            <span className="text-xl">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
