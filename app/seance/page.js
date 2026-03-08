'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Couleurs des badges par catégorie
const CATEGORIE_COLORS = {
  musculation: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  poids_corps: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  mobilite: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  autres: { bg: 'rgba(255,255,255,0.08)', text: '#999', border: 'rgba(255,255,255,0.12)' },
}

// Badge générique réutilisable
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

// Card cardio — affiche un bloc de cardio parsé
function CardioCard({ bloc }) {
  return (
    <div
      className="rounded-[10px] px-3.5 py-3.5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge label="Cardio" bg="rgba(59,130,246,0.15)" text="#93c5fd" border="rgba(59,130,246,0.25)" />
      </div>
      <p className="text-sm font-medium" style={{ color: '#f0f0f0' }}>
        {bloc.type_cardio}
      </p>
      <p className="text-xs mt-1" style={{ color: '#777' }}>
        {bloc.duree_minutes && <span>{bloc.duree_minutes} min</span>}
        {bloc.distance_km && <span> · {bloc.distance_km} km</span>}
        {bloc.calories && <span> · {bloc.calories} kcal</span>}
        {bloc.frequence_cardiaque && <span> · {bloc.frequence_cardiaque} bpm</span>}
        {bloc.rpe && <span> · RPE {bloc.rpe}</span>}
      </p>
    </div>
  )
}

// Card exercice — affiche un exercice parsé avec ses séries
function ExerciceCard({ exercice }) {
  const catColors = CATEGORIE_COLORS[exercice.categorie] || CATEGORIE_COLORS.autres

  return (
    <div
      className="rounded-[10px] px-3.5 py-3.5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Badges catégorie + groupe musculaire */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge label={exercice.categorie} bg={catColors.bg} text={catColors.text} border={catColors.border} />
        {exercice.groupe_musculaire && (
          <Badge label={exercice.groupe_musculaire} bg="rgba(249,115,22,0.12)" text="#f97316" border="rgba(249,115,22,0.2)" />
        )}
      </div>

      {/* Nom de l'exercice */}
      <p className="text-sm font-medium mb-1.5" style={{ color: '#f0f0f0' }}>
        {exercice.nom}
      </p>

      {/* Liste des séries */}
      <div className="flex flex-col gap-0.5">
        {exercice.series?.map((serie) => (
          <p key={serie.num_serie} className="text-xs" style={{ color: '#777' }}>
            Série {serie.num_serie} : {serie.repetitions} reps
            {serie.poids_kg != null && (
              <span>
                {' '}× {serie.poids_kg} kg
                {serie.unite_detectee === 'lbs' && (
                  <span style={{ color: '#555' }}> ({Math.round(serie.poids_kg * 2.20462)} lbs)</span>
                )}
              </span>
            )}
          </p>
        ))}
      </div>
    </div>
  )
}

// Page Séance — saisie NLP + écran de validation + sauvegarde DB
export default function SeancePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [userId, setUserId] = useState(null)

  // États du flow : idle → loading → parsed | error | saving | saved
  const [step, setStep] = useState('idle')
  const [texte, setTexte] = useState('')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [contexte, setContexte] = useState('maison')

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUserId(session.user.id)
      setAuthLoading(false)
    }
    checkAuth()
  }, [router])

  // Appel à l'API parse-seance
  async function handleAnalyze() {
    if (!texte.trim()) return

    setStep('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/parse-seance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: texte.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur inconnue.')
        setStep('error')
        return
      }

      setResult(data)
      setStep('parsed')
    } catch (err) {
      setErrorMsg('Erreur réseau. Vérifie ta connexion.')
      setStep('error')
    }
  }

  // Retour à la saisie avec le texte pré-rempli
  function handleModify() {
    setStep('idle')
    setResult(null)
  }

  // ── SAUVEGARDE COMPLÈTE EN DB ──
  async function handleConfirm() {
    if (!result || !userId) return

    setStep('saving')
    setErrorMsg('')

    try {
      // Étape 1 — Créer la séance
      const now = new Date()
      const { data: seanceData, error: seanceError } = await supabase
        .from('seances')
        .insert({
          user_id: userId,
          date: now.toISOString().split('T')[0],
          heure_debut: now.toTimeString().split(' ')[0],
          contexte: contexte,
          texte_brut: texte.trim(),
        })
        .select('id')
        .single()

      if (seanceError) throw new Error(`Séance : ${seanceError.message}`)

      const seanceId = seanceData.id
      console.log('✅ Séance créée :', seanceId)

      // Étape 2 — Sauvegarder les blocs cardio
      if (result.cardio?.length > 0) {
        const cardioRows = result.cardio.map((bloc, i) => ({
          seance_id: seanceId,
          type_cardio: bloc.type_cardio,
          duree_minutes: bloc.duree_minutes,
          distance_km: bloc.distance_km || null,
          calories: bloc.calories || null,
          frequence_cardiaque: bloc.frequence_cardiaque || null,
          rpe: bloc.rpe || null,
          ordre: i,
        }))

        const { error: cardioError } = await supabase
          .from('cardio_blocs')
          .insert(cardioRows)

        if (cardioError) throw new Error(`Cardio : ${cardioError.message}`)
        console.log('✅ Cardio sauvegardé :', cardioRows.length, 'blocs')
      }

      // Étape 3 — Pour chaque exercice : auto-learning + sauvegarde séries
      const seriesRows = []

      for (let i = 0; i < (result.exercices?.length || 0); i++) {
        const ex = result.exercices[i]
        let exerciceId = null

        // Chercher l'exercice dans le catalogue (ILIKE = insensible à la casse)
        const { data: found } = await supabase
          .from('exercices')
          .select('id')
          .ilike('nom', ex.nom)
          .limit(1)

        if (found && found.length > 0) {
          // Exercice trouvé dans le catalogue
          exerciceId = found[0].id
          console.log(`📖 Exercice trouvé : "${ex.nom}" → id=${exerciceId}`)
        } else {
          // Auto-learning : créer l'exercice avec source='ia_infere'
          const { data: created, error: createError } = await supabase
            .from('exercices')
            .insert({
              nom: ex.nom,
              categorie: ex.categorie,
              groupe_musculaire: ex.groupe_musculaire,
              type_equipement: ex.type,
              is_custom: true,
              source: 'ia_infere',
              user_id: userId,
            })
            .select('id')
            .single()

          if (createError) {
            console.error(`⚠️ Impossible de créer "${ex.nom}" :`, createError.message)
            continue // Best effort — on continue avec les autres
          }

          exerciceId = created.id
          console.log(`🧠 Exercice auto-créé : "${ex.nom}" → id=${exerciceId}`)
        }

        // Sauvegarder les séries
        for (const serie of (ex.series || [])) {
          seriesRows.push({
            seance_id: seanceId,
            exercice_id: exerciceId,
            ordre: i,
            num_serie: serie.num_serie,
            repetitions: serie.repetitions,
            poids_kg: serie.poids_kg || null,
          })
        }
      }

      // Insert groupé de toutes les séries
      if (seriesRows.length > 0) {
        const { error: seriesError } = await supabase
          .from('series')
          .insert(seriesRows)

        if (seriesError) throw new Error(`Séries : ${seriesError.message}`)
        console.log('✅ Séries sauvegardées :', seriesRows.length, 'lignes')
      }

      // Étape 4 — Feedback succès
      setStep('saved')

      // Retour à l'état idle après 3 secondes
      setTimeout(() => {
        setStep('idle')
        setTexte('')
        setResult(null)
        setContexte('maison')
      }, 3000)

    } catch (err) {
      console.error('❌ Erreur sauvegarde :', err)
      setErrorMsg(err.message || 'Erreur lors de la sauvegarde.')
      setStep('parsed') // Revenir à l'écran de validation pour retry
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>⚡ Séance</h1>

      {/* ── ÉCRAN 1 : SAISIE NLP ── */}
      {(step === 'idle' || step === 'loading' || step === 'error') && (
        <div>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Décris ta séance... ex: 20 min vélo RPE 7, pompes 3x20, tractions 8 8 6, curl 15kg 3x12"
            className="w-full text-sm outline-none resize-y"
            style={{
              minHeight: '120px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              padding: '14px',
              color: '#f0f0f0',
            }}
          />

          {/* Bouton Analyser */}
          <button
            onClick={handleAnalyze}
            disabled={step === 'loading' || !texte.trim()}
            className="w-full mt-3 py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
            style={{
              background: 'linear-gradient(135deg, #f97316, #dc2626)',
              borderRadius: '10px',
            }}
          >
            {step === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse en cours...
              </span>
            ) : (
              '⚡ Analyser'
            )}
          </button>

          {/* Message d'erreur */}
          {step === 'error' && errorMsg && (
            <p className="text-sm text-center mt-3" style={{ color: '#ef4444' }}>{errorMsg}</p>
          )}
        </div>
      )}

      {/* ── ÉCRAN 2 : VALIDATION DU PARSING ── */}
      {(step === 'parsed' || step === 'saving') && result && (
        <div>
          {/* Sélecteur de contexte */}
          <div className="flex gap-2 mb-4">
            {[
              { value: 'maison', label: '🏠 Maison' },
              { value: 'salle', label: '🏋️ Salle' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setContexte(opt.value)}
                className="flex-1 py-2 text-sm font-medium rounded-[10px] transition-colors"
                style={{
                  background: contexte === opt.value ? '#f97316' : 'rgba(255,255,255,0.07)',
                  color: contexte === opt.value ? '#fff' : '#777',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Titre */}
          <p className="text-base font-semibold mb-4">
            <span style={{ color: '#c084fc' }}>🧠 L'IA a compris :</span>
          </p>

          {/* Cards cardio */}
          {result.cardio?.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {result.cardio.map((bloc, i) => (
                <CardioCard key={i} bloc={bloc} />
              ))}
            </div>
          )}

          {/* Cards exercices */}
          {result.exercices?.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {result.exercices.map((ex, i) => (
                <ExerciceCard key={i} exercice={ex} />
              ))}
            </div>
          )}

          {/* Message si aucun résultat */}
          {(!result.cardio || result.cardio.length === 0) && (!result.exercices || result.exercices.length === 0) && (
            <p className="text-sm text-center my-8" style={{ color: '#777' }}>
              Aucun exercice détecté. Essaie de reformuler.
            </p>
          )}

          {/* Message d'erreur de sauvegarde */}
          {errorMsg && (
            <p className="text-sm text-center mb-3" style={{ color: '#ef4444' }}>{errorMsg}</p>
          )}

          {/* Boutons Confirmer / Modifier */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={step === 'saving'}
              className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
            >
              {step === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                  Enregistrement...
                </span>
              ) : (
                '✅ Confirmer'
              )}
            </button>
            <button
              onClick={handleModify}
              disabled={step === 'saving'}
              className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#777' }}
            >
              ✏️ Modifier
            </button>
          </div>
        </div>
      )}

      {/* ── ÉCRAN 3 : CONFIRMATION SUCCÈS ── */}
      {step === 'saved' && (
        <div className="flex flex-col items-center justify-center mt-16 gap-3">
          <p className="text-4xl">✅</p>
          <p className="text-lg font-semibold" style={{ color: '#22c55e' }}>Séance enregistrée !</p>
          <p className="text-xs" style={{ color: '#777' }}>Retour automatique dans 3 secondes...</p>
        </div>
      )}
    </div>
  )
}
