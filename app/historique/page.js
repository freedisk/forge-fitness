'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toDisplay, unitLabel } from '@/utils/units'
import { calcVolumeSeance, formatCharge } from '@/utils/volume'

// Labels lisibles pour les types de cardio
const CARDIO_LABELS = {
  velo: '🚴 Vélo',
  course: '🏃 Course',
  elliptique: '🔄 Elliptique',
  tapis: '🏃 Tapis',
  stepper: '🪜 Stepper',
  spinning: '🚴 Spinning',
  rameur: '🚣 Rameur',
  corde_a_sauter: '⏫ Corde à sauter',
}

// Formater une date en français lisible : "Lundi 8 mars 2026"
function formatDateFr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const formatted = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// Regrouper les séries par exercice, triées par ordre puis num_serie
function groupSeriesByExercice(series) {
  const groups = {}
  for (const s of (series || [])) {
    const eid = s.exercice_id
    if (!groups[eid]) {
      groups[eid] = {
        exerciceId: eid,
        nom: s.exercices?.nom || 'Exercice inconnu',
        series: [],
      }
    }
    groups[eid].series.push(s)
  }
  return Object.values(groups)
    .map((g) => ({
      ...g,
      series: g.series.sort((a, b) => a.num_serie - b.num_serie),
      ordre: Math.min(...g.series.map((s) => s.ordre)),
    }))
    .sort((a, b) => a.ordre - b.ordre)
}

// Résumé compact : "3×20" ou "8-8-6" + poids max si applicable
function formatExerciceSummary(groupedSeries, unite) {
  const reps = groupedSeries.map((s) => s.repetitions)
  const allSame = reps.every((r) => r === reps[0])
  let str = allSame ? `${reps.length}×${reps[0]}` : reps.join('-')

  const weights = groupedSeries.filter((s) => s.poids_kg != null)
  if (weights.length > 0) {
    const maxW = Math.max(...weights.map((s) => s.poids_kg))
    str += ` × ${toDisplay(maxW, unite)} ${unitLabel(unite)}`
  }

  return str
}

// Construire la map des records personnels à partir de toutes les séries
function buildPrMap(seances) {
  const prs = {}
  for (const seance of (seances || [])) {
    for (const serie of (seance.series || [])) {
      const eid = serie.exercice_id
      if (!prs[eid]) prs[eid] = { maxPoids: null, maxReps: null }

      if (serie.poids_kg != null) {
        if (prs[eid].maxPoids === null || serie.poids_kg > prs[eid].maxPoids) {
          prs[eid].maxPoids = serie.poids_kg
        }
      } else {
        if (prs[eid].maxReps === null || serie.repetitions > prs[eid].maxReps) {
          prs[eid].maxReps = serie.repetitions
        }
      }
    }
  }
  return prs
}

// Vérifier si une séance contient au moins un PR
function seanceHasPR(seance, prMap) {
  for (const serie of (seance.series || [])) {
    const pr = prMap[serie.exercice_id]
    if (!pr) continue
    if (serie.poids_kg != null && serie.poids_kg === pr.maxPoids) return true
    if (serie.poids_kg == null && serie.repetitions === pr.maxReps) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════
// Page Historique — liste des séances avec résumé + badge PR
// ══════════════════════════════════════════════════════════════
export default function HistoriquePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seances, setSeances] = useState([])
  const [unite, setUnite] = useState('kg')
  const [prMap, setPrMap] = useState({})

  // ── Suppression rapide d'une séance depuis la liste ──
  async function handleDeleteSeance(e, seanceId, seanceDate) {
    e.preventDefault()      // empêche la navigation <Link>
    e.stopPropagation()     // empêche le clic sur la card

    const dateFormatted = new Date(seanceDate + 'T00:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })

    if (!confirm(`Supprimer la séance du ${dateFormatted} ?\n\nCette action est irréversible. Toutes les séries et blocs cardio associés seront supprimés.`)) {
      return
    }

    const { error: delError } = await supabase
      .from('seances')
      .delete()
      .eq('id', seanceId)

    if (!delError) {
      // Optimistic update : retirer de la liste locale
      setSeances((prev) => prev.filter((s) => s.id !== seanceId))
    } else {
      console.error('Erreur suppression séance:', delError)
      alert('Erreur lors de la suppression.')
    }
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Charger le profil pour l'unité de poids
      const { data: profil } = await supabase
        .from('profils')
        .select('unite_poids')
        .eq('user_id', session.user.id)
        .single()
      if (profil?.unite_poids) setUnite(profil.unite_poids)

      // Charger toutes les séances avec jointures (cardio + séries + exercices)
      const { data, error: fetchError } = await supabase
        .from('seances')
        .select(`
          *,
          cardio_blocs(*),
          series(*, exercices(nom, categorie, groupe_musculaire))
        `)
        .eq('user_id', session.user.id)
        .order('date', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setSeances(data || [])
      setPrMap(buildPrMap(data))
      setLoading(false)
    }
    load()
  }, [router])

  // ── États : chargement, erreur, vide ──

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

  if (seances.length === 0) {
    return (
      <div className="min-h-screen px-4 pt-8">
        <h1 className="text-2xl font-bold mb-8" style={{ color: '#f0f0f0' }}>📋 Historique</h1>
        <div className="text-center mt-16">
          <p className="text-sm mb-4" style={{ color: '#777' }}>
            Aucune séance enregistrée.
          </p>
          <Link
            href="/seance"
            className="text-sm font-semibold"
            style={{ color: '#f97316' }}
          >
            Lance ta première séance ! ⚡
          </Link>
        </div>
      </div>
    )
  }

  // ── Liste des séances ──

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>📋 Historique</h1>

      <div className="flex flex-col gap-3">
        {seances.map((seance) => {
          const groups = groupSeriesByExercice(seance.series)
          const hasPR = seanceHasPR(seance, prMap)

          return (
            <Link key={seance.id} href={`/historique/${seance.id}`} className="block">
              <div
                className="rounded-xl px-4 py-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: hasPR
                    ? '1px solid rgba(34,197,94,0.2)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {/* Header : date + contexte + durée + badge PR */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: '#f0f0f0' }}>
                    {formatDateFr(seance.date)}
                  </p>
                  <div className="flex items-center gap-2">
                    {hasPR && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                      >
                        🏆 PR
                      </span>
                    )}
                    <span className="text-xs" style={{ color: '#777' }}>
                      {seance.contexte === 'salle' ? '🏋️' : '🏠'}
                      {seance.duree_totale ? ` · ${seance.duree_totale} min` : ''}
                    </span>
                  </div>
                </div>

                {/* Résumé cardio */}
                {seance.cardio_blocs?.length > 0 && (
                  <div className="mb-1">
                    {seance.cardio_blocs.map((bloc, i) => (
                      <p key={i} className="text-xs" style={{ color: '#777' }}>
                        {CARDIO_LABELS[bloc.type_cardio] || bloc.type_cardio}
                        {bloc.duree_minutes ? ` · ${bloc.duree_minutes} min` : ''}
                        {bloc.rpe ? ` · RPE ${bloc.rpe}` : ''}
                      </p>
                    ))}
                  </div>
                )}

                {/* Résumé exercices */}
                {groups.length > 0 && (
                  <div>
                    {groups.map((group, i) => (
                      <p key={i} className="text-xs" style={{ color: '#999' }}>
                        {group.nom} · {formatExerciceSummary(group.series, unite)}
                      </p>
                    ))}
                  </div>
                )}

                {/* Volume de séance — discret, muted */}
                {(() => {
                  const vol = calcVolumeSeance(seance.series || [])
                  if (vol.totalReps === 0) return null
                  return (
                    <p className="text-[11px] mt-1" style={{ color: '#777' }}>
                      {vol.totalReps} reps
                      {vol.totalCharge > 0 && ` · ${formatCharge(vol.totalCharge, unite)}`}
                    </p>
                  )
                })()}

                {/* Aperçu notes — discret, tronqué */}
                {seance.notes && (
                  <p className="text-[11px] mt-1 italic" style={{ color: '#777' }}>
                    📝 &ldquo;{seance.notes.length > 50 ? seance.notes.slice(0, 50) + '...' : seance.notes}&rdquo;
                  </p>
                )}

                {/* Bouton supprimer — en bas à droite */}
                <div className="flex justify-end mt-1">
                  <button
                    onClick={(e) => handleDeleteSeance(e, seance.id, seance.date)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#777',
                      fontSize: 16,
                      cursor: 'pointer',
                      padding: 8,
                      borderRadius: 8,
                      minWidth: 44,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Supprimer cette séance"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
