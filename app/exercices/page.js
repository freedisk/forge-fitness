'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Groupes musculaires pour les pills de filtre
const GROUPES = [
  'Tous', 'Pecs', 'Dos', 'Épaules', 'Biceps', 'Triceps',
  'Jambes', 'Abdos', 'Full body', 'Cardio',
]

// Badge source — rendu conditionnel selon la source de l'exercice
function SourceBadge({ source }) {
  if (source === 'catalogue' || !source) return null

  if (source === 'ia_infere') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          background: 'rgba(168,85,247,0.15)',
          color: '#c084fc',
          border: '1px solid rgba(168,85,247,0.25)',
        }}
      >
        🧠 Auto-appris
      </span>
    )
  }

  if (source === 'manuel') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          background: 'rgba(59,130,246,0.12)',
          color: '#93c5fd',
          border: '1px solid rgba(59,130,246,0.2)',
        }}
      >
        ✏️ Manuel
      </span>
    )
  }

  return null
}

// Page Catalogue — liste browsable des exercices avec filtre par groupe
export default function ExercicesPage() {
  const router = useRouter()
  const [exercices, setExercices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtre, setFiltre] = useState('Tous')

  useEffect(() => {
    async function load() {
      // Vérifier l'auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Charger tous les exercices visibles (RLS gère la visibilité)
      const { data, error } = await supabase
        .from('exercices')
        .select('*')
        .order('groupe_musculaire', { ascending: true })
        .order('nom', { ascending: true })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setExercices(data || [])
      setLoading(false)
    }
    load()
  }, [router])

  // Filtre côté client — pas de nouvelle requête DB
  const filtered = useMemo(() => {
    if (filtre === 'Tous') return exercices
    if (filtre === 'Cardio') return exercices.filter((ex) => ex.categorie === 'cardio')
    return exercices.filter((ex) =>
      ex.groupe_musculaire?.toLowerCase() === filtre.toLowerCase()
    )
  }, [exercices, filtre])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm" style={{ color: '#ef4444' }}>Erreur : {error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>📖 Catalogue</h1>

      {/* Barre de pills — scroll horizontal */}
      <div
        className="flex gap-2 overflow-x-auto pb-3 mb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {GROUPES.map((g) => (
          <button
            key={g}
            onClick={() => setFiltre(g)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              background: filtre === g ? '#f97316' : 'rgba(255,255,255,0.07)',
              color: filtre === g ? '#fff' : '#777',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Compteur */}
      <p className="text-xs mb-3" style={{ color: '#777' }}>
        {filtered.length} exercice{filtered.length > 1 ? 's' : ''}
      </p>

      {/* Liste des exercices */}
      {filtered.length === 0 ? (
        <p className="text-sm text-center mt-12" style={{ color: '#777' }}>
          Aucun exercice dans cette catégorie
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded-[10px] px-3.5 py-3.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                  {ex.nom}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#777' }}>
                  {ex.categorie && <span>{ex.categorie}</span>}
                  {ex.categorie && ex.type_equipement && <span> · </span>}
                  {ex.type_equipement && <span>{ex.type_equipement}</span>}
                </p>
              </div>
              <SourceBadge source={ex.source} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
