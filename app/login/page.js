'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Page de connexion / inscription — Auth email + mot de passe
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  // Connexion avec email/mot de passe
  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
  }

  // Création de compte
  async function handleSignUp(e) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Vérifie ton email pour confirmer ton compte.')
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#0a0a0a' }}>
      <div className="w-full max-w-sm">
        {/* Logo FORGE */}
        <h1 className="text-center text-4xl font-bold mb-8">
          <span style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ⚡ FORGE
          </span>
        </h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {/* Champ email */}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg px-4 py-3 text-sm outline-none placeholder-[#777] focus:ring-2 focus:ring-[#f97316]"
            style={{ background: 'rgba(255,255,255,0.07)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.08)' }}
          />

          {/* Champ mot de passe */}
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none placeholder-[#777] focus:ring-2 focus:ring-[#f97316]"
            style={{ background: 'rgba(255,255,255,0.07)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.08)' }}
          />

          {/* Message d'erreur */}
          {error && (
            <p className="text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>
          )}

          {/* Message de succès */}
          {message && (
            <p className="text-sm text-center" style={{ color: '#22c55e' }}>{message}</p>
          )}

          {/* Bouton connexion */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: '#f97316', color: '#fff' }}
          >
            {loading ? 'Chargement...' : 'Se connecter'}
          </button>

          {/* Bouton inscription */}
          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Créer un compte
          </button>
        </form>
      </div>
    </div>
  )
}
