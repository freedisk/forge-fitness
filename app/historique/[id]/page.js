'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toDisplay, unitLabel } from '@/utils/units'

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

// Couleurs des badges par catégorie
const CATEGORIE_COLORS = {
  musculation: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  poids_corps: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  mobilite: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  autres: { bg: 'rgba(255,255,255,0.08)', text: '#999', border: 'rgba(255,255,255,0.12)' },
}

// Badge réutilisable
function Badge({ label, bg, text, border }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
      style={{ background: bg, color: text, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  )
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

// Regrouper les séries par exercice avec infos complètes
function groupSeriesByExercice(series) {
  const groups = {}
  for (const s of (series || [])) {
    const eid = s.exercice_id
    if (!groups[eid]) {
      groups[eid] = {
        exerciceId: eid,
        nom: s.exercices?.nom || 'Exercice inconnu',
        categorie: s.exercices?.categorie || null,
        groupe_musculaire: s.exercices?.groupe_musculaire || null,
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

// ══════════════════════════════════════════════════════════════
// Page Détail Séance — exercices, séries, PR, texte brut, suppression
// ══════════════════════════════════════════════════════════════
export default function SeanceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const seanceId = params.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seance, setSeance] = useState(null)
  const [unite, setUnite] = useState('kg')
  const [prMap, setPrMap] = useState({})
  const [showTexteBrut, setShowTexteBrut] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

      // Charger la séance avec jointures complètes
      const { data: seanceData, error: fetchError } = await supabase
        .from('seances')
        .select(`
          *,
          cardio_blocs(*),
          series(*, exercices(nom, categorie, groupe_musculaire))
        `)
        .eq('id', seanceId)
        .eq('user_id', session.user.id)
        .single()

      if (fetchError || !seanceData) {
        setError('Séance introuvable.')
        setLoading(false)
        return
      }

      setSeance(seanceData)

      // ── Calcul des PR pour les exercices de cette séance ──
      const exerciceIds = [...new Set((seanceData.series || []).map((s) => s.exercice_id))]

      if (exerciceIds.length > 0) {
        // Récupérer toutes les séances de l'utilisateur (pour filtrer les séries)
        const { data: userSeances } = await supabase
          .from('seances')
          .select('id')
          .eq('user_id', session.user.id)
        const userSeanceIds = (userSeances || []).map((s) => s.id)

        // Charger toutes les séries de ces exercices (toutes séances du user)
        const { data: allSeries } = await supabase
          .from('series')
          .select('exercice_id, poids_kg, repetitions')
          .in('exercice_id', exerciceIds)
          .in('seance_id', userSeanceIds)

        // Construire la map des PR
        const prs = {}
        for (const s of (allSeries || [])) {
          const eid = s.exercice_id
          if (!prs[eid]) prs[eid] = { maxPoids: null, maxReps: null }

          if (s.poids_kg != null) {
            if (prs[eid].maxPoids === null || s.poids_kg > prs[eid].maxPoids) {
              prs[eid].maxPoids = s.poids_kg
            }
          } else {
            if (prs[eid].maxReps === null || s.repetitions > prs[eid].maxReps) {
              prs[eid].maxReps = s.repetitions
            }
          }
        }
        setPrMap(prs)
      }

      setLoading(false)
    }
    load()
  }, [router, seanceId])

  // Vérifier si une série est un record personnel
  function isPR(serie) {
    const pr = prMap[serie.exercice_id]
    if (!pr) return false
    if (serie.poids_kg != null) return serie.poids_kg === pr.maxPoids
    return serie.repetitions === pr.maxReps
  }

  // Supprimer la séance (DELETE CASCADE gère cardio_blocs + series)
  async function handleDelete() {
    if (!confirm('Es-tu sûr de vouloir supprimer cette séance ?')) return

    setDeleting(true)
    const { error: delError } = await supabase
      .from('seances')
      .delete()
      .eq('id', seanceId)

    if (delError) {
      console.error('❌ Erreur suppression :', delError.message)
      setDeleting(false)
      return
    }

    console.log('✅ Séance supprimée :', seanceId)
    router.push('/historique')
  }

  // ── États : chargement, erreur ──

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  if (error || !seance) {
    return (
      <div className="min-h-screen px-4 pt-8">
        <Link href="/historique" className="text-sm" style={{ color: '#f97316' }}>
          ← Historique
        </Link>
        <p className="text-sm mt-8 text-center" style={{ color: '#ef4444' }}>
          {error || 'Séance introuvable.'}
        </p>
      </div>
    )
  }

  const groups = groupSeriesByExercice(seance.series)

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      {/* Bouton retour */}
      <Link href="/historique" className="text-sm font-medium" style={{ color: '#f97316' }}>
        ← Historique
      </Link>

      {/* ── HEADER ── */}
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#f0f0f0' }}>
          {formatDateFr(seance.date)}
        </h1>
        <p className="text-xs mt-1" style={{ color: '#777' }}>
          {seance.contexte === 'salle' ? '🏋️ Salle' : '🏠 Maison'}
          {seance.heure_debut ? ` · Début ${seance.heure_debut}` : ''}
          {seance.duree_totale ? ` · ${seance.duree_totale} min` : ''}
        </p>
      </div>

      {/* ── SECTION CARDIO ── */}
      {seance.cardio_blocs?.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#777' }}>
            Cardio
          </p>
          <div className="flex flex-col gap-2">
            {seance.cardio_blocs.map((bloc, i) => (
              <div
                key={i}
                className="rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>
                  {CARDIO_LABELS[bloc.type_cardio] || bloc.type_cardio}
                </p>
                <p className="text-xs mt-1" style={{ color: '#777' }}>
                  {bloc.duree_minutes ? `${bloc.duree_minutes} min` : ''}
                  {bloc.distance_km ? ` · ${bloc.distance_km} km` : ''}
                  {bloc.calories ? ` · ${bloc.calories} kcal` : ''}
                  {bloc.frequence_cardiaque ? ` · ${bloc.frequence_cardiaque} bpm` : ''}
                  {bloc.rpe ? ` · RPE ${bloc.rpe}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION EXERCICES ── */}
      {groups.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#777' }}>
            Exercices
          </p>
          <div className="flex flex-col gap-3">
            {groups.map((group, i) => {
              const catColors = CATEGORIE_COLORS[group.categorie] || CATEGORIE_COLORS.autres
              const groupHasPR = group.series.some((s) => isPR(s))

              return (
                <div
                  key={i}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: groupHasPR
                      ? '1px solid rgba(34,197,94,0.25)'
                      : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {/* Nom exercice */}
                  <p className="text-sm font-semibold mb-1.5" style={{ color: '#f0f0f0' }}>
                    {group.nom}
                  </p>

                  {/* Badges catégorie + groupe musculaire */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {group.categorie && (
                      <Badge
                        label={group.categorie}
                        bg={catColors.bg}
                        text={catColors.text}
                        border={catColors.border}
                      />
                    )}
                    {group.groupe_musculaire && (
                      <Badge
                        label={group.groupe_musculaire}
                        bg="rgba(249,115,22,0.12)"
                        text="#f97316"
                        border="rgba(249,115,22,0.2)"
                      />
                    )}
                  </div>

                  {/* Tableau des séries */}
                  <div className="mt-2">
                    {/* En-tête du tableau */}
                    <div
                      className="flex items-center text-[10px] uppercase tracking-wider pb-1 mb-1"
                      style={{ color: '#555', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="w-12">Série</span>
                      <span className="w-14">Reps</span>
                      <span className="flex-1">Poids</span>
                    </div>

                    {/* Lignes des séries */}
                    {group.series.map((serie) => {
                      const serieIsPR = isPR(serie)
                      return (
                        <div
                          key={serie.num_serie}
                          className="flex items-center py-1 text-xs"
                          style={{ color: serieIsPR ? '#22c55e' : '#999' }}
                        >
                          <span className="w-12">{serie.num_serie}</span>
                          <span className="w-14">{serie.repetitions}</span>
                          <span className="flex-1">
                            {serie.poids_kg != null
                              ? `${toDisplay(serie.poids_kg, unite)} ${unitLabel(unite)}`
                              : 'PDC'}
                          </span>
                          {serieIsPR && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                            >
                              🏆 PR
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TEXTE BRUT (repliable) ── */}
      {seance.texte_brut && (
        <div className="mb-6">
          <button
            onClick={() => setShowTexteBrut(!showTexteBrut)}
            className="text-xs font-medium"
            style={{ color: '#555' }}
          >
            {showTexteBrut ? '▼' : '▶'} Texte brut original
          </button>
          {showTexteBrut && (
            <p
              className="text-xs mt-2 p-3 rounded-lg whitespace-pre-wrap"
              style={{ color: '#555', background: 'rgba(255,255,255,0.03)' }}
            >
              {seance.texte_brut}
            </p>
          )}
        </div>
      )}

      {/* ── BOUTON SUPPRIMER ── */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full py-3 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        style={{
          background: 'rgba(239,68,68,0.1)',
          color: '#ef4444',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        {deleting ? 'Suppression...' : '🗑️ Supprimer cette séance'}
      </button>
    </div>
  )
}
