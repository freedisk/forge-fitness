'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toDisplay, toKg, unitLabel } from '@/utils/units'

// Page Profil — formulaire onboarding / édition du profil utilisateur
export default function ProfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  // Champs du formulaire
  const [age, setAge] = useState('')
  const [sexe, setSexe] = useState('')
  const [poids, setPoids] = useState('')
  const [taille, setTaille] = useState('')
  const [objectif, setObjectif] = useState('')
  const [niveau, setNiveau] = useState('')
  const [contextes, setContextes] = useState([])
  const [unite, setUnite] = useState('kg')

  useEffect(() => {
    async function loadProfile() {
      // Vérifier l'auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      setUserId(session.user.id)

      // Charger le profil existant
      const { data, error } = await supabase
        .from('profils')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (data) {
        setAge(data.age || '')
        setSexe(data.sexe || '')
        setTaille(data.taille_cm || '')
        setObjectif(data.objectif || '')
        setNiveau(data.niveau || '')
        setContextes(data.contextes || [])
        setUnite(data.unite_poids || 'kg')
        // Afficher le poids converti si unité lbs
        if (data.poids_kg) {
          setPoids(toDisplay(data.poids_kg, data.unite_poids || 'kg'))
        }
      }

      setLoading(false)
    }
    loadProfile()
  }, [router])

  // Toggle checkbox contexte
  function toggleContexte(val) {
    setContextes((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    )
  }

  // Sauvegarde du profil (UPSERT)
  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)

    // Convertir le poids en kg avant sauvegarde
    const poidsKg = poids ? toKg(parseFloat(poids), unite) : null

    const { error } = await supabase
      .from('profils')
      .upsert({
        user_id: userId,
        age: age ? parseInt(age) : null,
        sexe: sexe || null,
        poids_kg: poidsKg,
        taille_cm: taille ? parseInt(taille) : null,
        objectif: objectif || null,
        niveau: niveau || null,
        contextes,
        unite_poids: unite,
      }, { onConflict: 'user_id' })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  // Style commun pour les inputs
  const inputStyle = {
    background: 'rgba(255,255,255,0.07)',
    color: '#f0f0f0',
    border: '1px solid rgba(255,255,255,0.08)',
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#f0f0f0' }}>👤 Profil</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-sm">
        {/* Âge */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Âge</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Ex: 35"
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Sexe */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Sexe</label>
          <select
            value={sexe}
            onChange={(e) => setSexe(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        {/* Unité de poids — toggle */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Unité de poids</label>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => {
                // Convertir la valeur affichée si on change d'unité
                if (unite === 'lbs' && poids) {
                  setPoids(toKg(parseFloat(poids), 'lbs'))
                }
                setUnite('kg')
              }}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{
                background: unite === 'kg' ? '#f97316' : 'rgba(255,255,255,0.04)',
                color: unite === 'kg' ? '#fff' : '#777',
              }}
            >
              kg
            </button>
            <button
              type="button"
              onClick={() => {
                // Convertir la valeur affichée si on change d'unité
                if (unite === 'kg' && poids) {
                  setPoids(toDisplay(parseFloat(poids), 'lbs'))
                }
                setUnite('lbs')
              }}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{
                background: unite === 'lbs' ? '#f97316' : 'rgba(255,255,255,0.04)',
                color: unite === 'lbs' ? '#fff' : '#777',
              }}
            >
              lbs
            </button>
          </div>
        </div>

        {/* Poids */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Poids ({unitLabel(unite)})</label>
          <input
            type="number"
            step="0.1"
            value={poids}
            onChange={(e) => setPoids(e.target.value)}
            placeholder={unite === 'kg' ? 'Ex: 80' : 'Ex: 176'}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Taille */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Taille (cm)</label>
          <input
            type="number"
            value={taille}
            onChange={(e) => setTaille(e.target.value)}
            placeholder="Ex: 180"
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Objectif */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Objectif</label>
          <select
            value={objectif}
            onChange={(e) => setObjectif(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="equilibre">Équilibre</option>
            <option value="force">Force</option>
            <option value="cardio">Cardio</option>
            <option value="perte_poids">Perte de poids</option>
            <option value="prise_masse">Prise de masse</option>
          </select>
        </div>

        {/* Niveau */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Niveau</label>
          <select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="debutant">Débutant</option>
            <option value="intermediaire">Intermédiaire</option>
            <option value="confirme">Confirmé</option>
          </select>
        </div>

        {/* Contextes disponibles */}
        <div>
          <label className="text-xs mb-2 block" style={{ color: '#777' }}>Contextes disponibles</label>
          <div className="flex gap-3">
            {['Maison', 'Salle', 'Extérieur'].map((ctx) => (
              <label key={ctx} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#f0f0f0' }}>
                <input
                  type="checkbox"
                  checked={contextes.includes(ctx.toLowerCase())}
                  onChange={() => toggleContexte(ctx.toLowerCase())}
                  className="accent-[#f97316]"
                />
                {ctx}
              </label>
            ))}
          </div>
        </div>

        {/* Message d'erreur */}
        {error && (
          <p className="text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {/* Message de succès */}
        {success && (
          <p className="text-sm text-center" style={{ color: '#22c55e' }}>Profil enregistré !</p>
        )}

        {/* Bouton sauvegarder */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: '#f97316', color: '#fff' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </div>
  )
}
