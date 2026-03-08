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

// Page Séance — saisie NLP + écran de validation
export default function SeancePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)

  // États du flow : idle → loading → parsed | error
  const [step, setStep] = useState('idle')
  const [texte, setTexte] = useState('')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setAuthLoading(false)
    }
    checkAuth()
  }, [router])

  // Appel à l'API parse-seance
  async function handleAnalyze() {
    if (!texte.trim()) return

    setStep('loading')
    setErrorMsg('')
    setConfirmed(false)

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
    setConfirmed(false)
  }

  // Confirmation (placeholder — la sauvegarde DB sera l'étape 5)
  function handleConfirm() {
    setConfirmed(true)
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
      {step === 'parsed' && result && (
        <div>
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

          {/* Message de confirmation */}
          {confirmed && (
            <p className="text-sm text-center mb-3" style={{ color: '#22c55e' }}>
              ✅ Séance validée !
            </p>
          )}

          {/* Boutons Confirmer / Modifier */}
          {!confirmed && (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
              >
                ✅ Confirmer
              </button>
              <button
                onClick={handleModify}
                className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#777' }}
              >
                ✏️ Modifier
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
