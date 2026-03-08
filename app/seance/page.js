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

// Ligne compacte pour le récap d'un exercice déjà enregistré
function RecapExerciceLine({ item }) {
  const seriesCount = item.series?.length || 0
  const repsSummary = item.series?.map((s) => s.repetitions).join('-') || ''
  const poids = item.series?.[0]?.poids_kg

  return (
    <div className="flex items-center justify-between py-1.5">
      <p className="text-sm truncate" style={{ color: '#f0f0f0' }}>{item.nom}</p>
      <p className="text-xs whitespace-nowrap ml-2" style={{ color: '#777' }}>
        {seriesCount}×{repsSummary}
        {poids != null && <span> · {poids}kg</span>}
      </p>
    </div>
  )
}

// ── NORMALISATION NOM EXERCICE — anti-doublon ──
// Normalise pour comparaison : minuscules, tirets→espaces, trim
function normalizeExerciceName(nom) {
  return nom
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Format canonique pour stockage : majuscule initiale, espaces, pas de tirets
function canonicalizeExerciceName(nom) {
  const normalized = normalizeExerciceName(nom)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

// ── LOGIQUE AUTO-LEARNING : chercher ou créer un exercice ──
async function resolveExerciceId(ex, userId) {
  const normalizedInput = normalizeExerciceName(ex.nom)

  // Charger tous les exercices accessibles : catalogue global + exercices du user
  const { data: allExercices } = await supabase
    .from('exercices')
    .select('id, nom')
    .or(`user_id.is.null,user_id.eq.${userId}`)

  // Comparer les noms normalisés des deux côtés
  if (allExercices && allExercices.length > 0) {
    const match = allExercices.find(
      (e) => normalizeExerciceName(e.nom) === normalizedInput
    )
    if (match) {
      console.log(`📖 Exercice trouvé (normalisé) : "${ex.nom}" → "${match.nom}" id=${match.id}`)
      return match.id
    }
  }

  // Auto-learning : créer avec le nom canonique (majuscule initiale, espaces)
  const canonicalName = canonicalizeExerciceName(ex.nom)
  const { data: created, error } = await supabase
    .from('exercices')
    .insert({
      nom: canonicalName,
      categorie: ex.categorie,
      groupe_musculaire: ex.groupe_musculaire,
      type: ex.type,
      is_custom: true,
      source: 'ia_infere',
      user_id: userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`⚠️ Impossible de créer "${canonicalName}" :`, error.message)
    return null
  }

  console.log(`🧠 Exercice auto-créé : "${canonicalName}" → id=${created.id}`)
  return created.id
}

// ── SAUVEGARDER cardio + exercices/séries dans une séance ──
async function saveParseResult(result, seanceId, userId) {
  const savedItems = []

  // Sauvegarder les blocs cardio
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

    const { error } = await supabase.from('cardio_blocs').insert(cardioRows)
    if (error) throw new Error(`Cardio : ${error.message}`)
    console.log('✅ Cardio sauvegardé :', cardioRows.length, 'blocs')

    // Ajouter au récap
    result.cardio.forEach((bloc) => {
      savedItems.push({ type: 'cardio', nom: bloc.type_cardio, duree: bloc.duree_minutes })
    })
  }

  // Pour chaque exercice : auto-learning + sauvegarde séries
  const seriesRows = []

  for (let i = 0; i < (result.exercices?.length || 0); i++) {
    const ex = result.exercices[i]
    const exerciceId = await resolveExerciceId(ex, userId)
    if (!exerciceId) continue // Best effort

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

    // Ajouter au récap
    savedItems.push({ type: 'exercice', nom: ex.nom, series: ex.series })
  }

  // Insert groupé de toutes les séries
  if (seriesRows.length > 0) {
    const { error } = await supabase.from('series').insert(seriesRows)
    if (error) throw new Error(`Séries : ${error.message}`)
    console.log('✅ Séries sauvegardées :', seriesRows.length, 'lignes')
  }

  return savedItems
}

// ══════════════════════════════════════════════════════════════
// Page Séance — saisie NLP multi-passes + validation + sauvegarde DB
// ══════════════════════════════════════════════════════════════
export default function SeancePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [userId, setUserId] = useState(null)

  // Séance en cours
  const [activeSeanceId, setActiveSeanceId] = useState(null)
  const [activeSeanceData, setActiveSeanceData] = useState([]) // items déjà sauvegardés
  const [heureDebut, setHeureDebut] = useState(null)

  // Flow de saisie
  const [texteInput, setTexteInput] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | parsed | saving | error
  const [contexte, setContexte] = useState('maison')
  const [errorMsg, setErrorMsg] = useState('')

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

  // ── Appel API parse-seance ──
  async function handleAnalyze() {
    if (!texteInput.trim()) return

    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/parse-seance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: texteInput.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur inconnue.')
        setStatus('error')
        return
      }

      setParseResult(data)
      setStatus('parsed')
    } catch (err) {
      setErrorMsg('Erreur réseau. Vérifie ta connexion.')
      setStatus('error')
    }
  }

  // ── Retour textarea avec texte pré-rempli ──
  function handleModify() {
    setStatus(activeSeanceId ? 'idle' : 'idle')
    setParseResult(null)
  }

  // ── PREMIÈRE PASSE : créer la séance + sauvegarder ──
  async function handleConfirm() {
    if (!parseResult || !userId) return

    setStatus('saving')
    setErrorMsg('')

    try {
      const now = new Date()
      const heure = now.toTimeString().split(' ')[0].slice(0, 5) // HH:MM

      // Créer la séance
      const { data: seanceData, error: seanceError } = await supabase
        .from('seances')
        .insert({
          user_id: userId,
          date: now.toISOString().split('T')[0],
          heure_debut: heure,
          contexte: contexte,
          texte_brut: texteInput.trim(),
        })
        .select('id')
        .single()

      if (seanceError) throw new Error(`Séance : ${seanceError.message}`)

      const seanceId = seanceData.id
      console.log('✅ Séance créée :', seanceId)

      // Sauvegarder cardio + exercices + séries
      const savedItems = await saveParseResult(parseResult, seanceId, userId)

      // Passer en mode séance active
      setActiveSeanceId(seanceId)
      setActiveSeanceData(savedItems)
      setHeureDebut(heure)
      setTexteInput('')
      setParseResult(null)
      setStatus('idle') // Prêt pour la passe suivante

    } catch (err) {
      console.error('❌ Erreur sauvegarde :', err)
      setErrorMsg(err.message || 'Erreur lors de la sauvegarde.')
      setStatus('parsed')
    }
  }

  // ── PASSES SUIVANTES : ajouter à la séance existante ──
  async function handleAddToSeance() {
    if (!parseResult || !userId || !activeSeanceId) return

    setStatus('saving')
    setErrorMsg('')

    try {
      // Mettre à jour texte_brut (concaténer)
      const { data: currentSeance } = await supabase
        .from('seances')
        .select('texte_brut')
        .eq('id', activeSeanceId)
        .single()

      const newTexteBrut = (currentSeance?.texte_brut || '') + ' | ' + texteInput.trim()

      await supabase
        .from('seances')
        .update({ texte_brut: newTexteBrut })
        .eq('id', activeSeanceId)

      console.log('✅ texte_brut mis à jour')

      // Sauvegarder cardio + exercices + séries
      const savedItems = await saveParseResult(parseResult, activeSeanceId, userId)

      // Mettre à jour le récap
      setActiveSeanceData((prev) => [...prev, ...savedItems])
      setTexteInput('')
      setParseResult(null)
      setStatus('idle')

    } catch (err) {
      console.error('❌ Erreur ajout :', err)
      setErrorMsg(err.message || 'Erreur lors de l\'ajout.')
      setStatus('parsed')
    }
  }

  // ── TERMINER LA SÉANCE ──
  async function handleFinish() {
    if (!activeSeanceId || !heureDebut) return

    try {
      // Calculer la durée totale en minutes
      const now = new Date()
      const [h, m] = heureDebut.split(':').map(Number)
      const debut = new Date()
      debut.setHours(h, m, 0, 0)
      const dureeMinutes = Math.round((now - debut) / 60000)

      await supabase
        .from('seances')
        .update({ duree_totale: dureeMinutes > 0 ? dureeMinutes : 1 })
        .eq('id', activeSeanceId)

      console.log('✅ Séance terminée — durée :', dureeMinutes, 'min')

      // Reset complet
      setActiveSeanceId(null)
      setActiveSeanceData([])
      setHeureDebut(null)
      setTexteInput('')
      setParseResult(null)
      setStatus('idle')
      setContexte('maison')

      router.push('/')
    } catch (err) {
      console.error('❌ Erreur fin séance :', err)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  // Détecter si on est en mode séance active
  const isActive = activeSeanceId !== null
  // En mode saisie : idle, loading, error (pas parsed, pas saving)
  const isInputMode = status === 'idle' || status === 'loading' || status === 'error'
  // En mode validation
  const isParseMode = status === 'parsed' || status === 'saving'

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>⚡ Séance</h1>

      {/* ── BANDEAU SÉANCE EN COURS ── */}
      {isActive && (
        <div
          className="rounded-[10px] px-4 py-3 mb-4 flex items-center justify-between"
          style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.2)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#f97316' }}>
            ⚡ Séance en cours
          </p>
          <p className="text-xs" style={{ color: '#fb923c' }}>
            {contexte === 'salle' ? '🏋️' : '🏠'} Depuis {heureDebut}
          </p>
        </div>
      )}

      {/* ── RÉCAP DES EXERCICES DÉJÀ ENREGISTRÉS ── */}
      {isActive && activeSeanceData.length > 0 && isInputMode && (
        <div
          className="rounded-[10px] px-4 py-3 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: '#777' }}>
            Déjà enregistré ({activeSeanceData.length})
          </p>
          <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {activeSeanceData.map((item, i) => (
              <div key={i} className="py-1.5 flex items-center justify-between">
                <p className="text-sm truncate" style={{ color: '#f0f0f0' }}>
                  {item.type === 'cardio' ? '🏃' : '💪'} {item.nom}
                </p>
                <p className="text-xs whitespace-nowrap ml-2" style={{ color: '#777' }}>
                  {item.type === 'cardio'
                    ? `${item.duree} min`
                    : `${item.series?.length || 0}×${item.series?.map((s) => s.repetitions).join('-') || ''}${item.series?.[0]?.poids_kg ? ` · ${item.series[0].poids_kg}kg` : ''}`
                  }
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SÉLECTEUR CONTEXTE (seulement si pas de séance active) ── */}
      {!isActive && isInputMode && (
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
      )}

      {/* ── ZONE DE SAISIE NLP (idle / loading / error) ── */}
      {isInputMode && (
        <div>
          <textarea
            value={texteInput}
            onChange={(e) => setTexteInput(e.target.value)}
            placeholder={isActive
              ? "Ajoute d'autres exercices... ex: tractions 8 8 6, curl 15kg 3x12"
              : "Décris ta séance... ex: 20 min vélo RPE 7, pompes 3x20, tractions 8 8 6, curl 15kg 3x12"
            }
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
            disabled={status === 'loading' || !texteInput.trim()}
            className="w-full mt-3 py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
            style={{
              background: 'linear-gradient(135deg, #f97316, #dc2626)',
              borderRadius: '10px',
            }}
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse en cours...
              </span>
            ) : (
              '⚡ Analyser'
            )}
          </button>

          {/* Message d'erreur */}
          {status === 'error' && errorMsg && (
            <p className="text-sm text-center mt-3" style={{ color: '#ef4444' }}>{errorMsg}</p>
          )}

          {/* Bouton Terminer la séance (seulement si séance active) */}
          {isActive && (
            <button
              onClick={handleFinish}
              className="w-full mt-4 py-3 text-sm font-semibold rounded-[10px] transition-colors"
              style={{ background: 'transparent', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              ✅ Terminer la séance
            </button>
          )}
        </div>
      )}

      {/* ── ÉCRAN VALIDATION DU PARSING ── */}
      {isParseMode && parseResult && (
        <div>
          {/* Titre */}
          <p className="text-base font-semibold mb-4">
            <span style={{ color: '#c084fc' }}>🧠 L'IA a compris :</span>
          </p>

          {/* Cards cardio */}
          {parseResult.cardio?.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {parseResult.cardio.map((bloc, i) => (
                <CardioCard key={i} bloc={bloc} />
              ))}
            </div>
          )}

          {/* Cards exercices */}
          {parseResult.exercices?.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {parseResult.exercices.map((ex, i) => (
                <ExerciceCard key={i} exercice={ex} />
              ))}
            </div>
          )}

          {/* Message si aucun résultat */}
          {(!parseResult.cardio || parseResult.cardio.length === 0) && (!parseResult.exercices || parseResult.exercices.length === 0) && (
            <p className="text-sm text-center my-8" style={{ color: '#777' }}>
              Aucun exercice détecté. Essaie de reformuler.
            </p>
          )}

          {/* Message d'erreur de sauvegarde */}
          {errorMsg && (
            <p className="text-sm text-center mb-3" style={{ color: '#ef4444' }}>{errorMsg}</p>
          )}

          {/* Boutons action */}
          <div className="flex gap-3">
            <button
              onClick={isActive ? handleAddToSeance : handleConfirm}
              disabled={status === 'saving'}
              className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
            >
              {status === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                  Enregistrement...
                </span>
              ) : isActive ? (
                '➕ Ajouter à la séance'
              ) : (
                '✅ Confirmer'
              )}
            </button>
            <button
              onClick={handleModify}
              disabled={status === 'saving'}
              className="flex-1 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#777' }}
            >
              ✏️ Modifier
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
