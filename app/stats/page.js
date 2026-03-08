'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Page Stats — placeholder avec check auth
export default function StatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setLoading(false)
    }
    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pt-12">
      <h1 className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>📊 Stats</h1>
      <p className="text-sm mt-2" style={{ color: '#777' }}>Bientôt disponible</p>
    </div>
  )
}
