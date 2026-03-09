'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toKg, toDisplay, unitLabel } from '@/utils/units'
import { resolveExerciceId, normalizeDbValue } from '@/utils/exercice-resolver'

// Clé localStorage pour persister la séance active
const LS_KEY = 'forge_active_seance'

// Couleurs des badges par catégorie
const CATEGORIE_COLORS = {
  musculation: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  poids_corps: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  mobilite: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  autres: { bg: 'rgba(255,255,255,0.08)', text: '#999', border: 'rgba(255,255,255,0.12)' },
}

// Couleurs badge contexte (templates)
const CONTEXTE_COLORS = {
  maison: { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd', border: 'rgba(59,130,246,0.25)' },
  salle: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  mixte: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
}

// Couleurs RPE (effort ressenti 1-10)
const RPE_COLORS = {
  1: '#22c55e', 2: '#22c55e',   // vert — léger
  3: '#84cc16', 4: '#84cc16',   // vert-jaune
  5: '#eab308', 6: '#eab308',   // jaune — modéré
  7: '#f97316', 8: '#f97316',   // orange
  9: '#ef4444', 10: '#ef4444',  // rouge — intense
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

// ── Fonctions auto-learning importées depuis @/utils/exercice-resolver ──
// resolveExerciceId, normalizeDbValue

// ── SAUVEGARDER cardio + exercices/séries dans une séance ──
async function saveParseResult(result, seanceId, userId) {
  const savedItems = []

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

    result.cardio.forEach((bloc) => {
      savedItems.push({ type: 'cardio', nom: bloc.type_cardio, duree: bloc.duree_minutes })
    })
  }

  const seriesRows = []

  for (let i = 0; i < (result.exercices?.length || 0); i++) {
    const ex = result.exercices[i]
    const exerciceId = await resolveExerciceId(ex, userId)
    if (!exerciceId) continue

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

    savedItems.push({ type: 'exercice', nom: ex.nom, series: ex.series })
  }

  if (seriesRows.length > 0) {
    const { error } = await supabase.from('series').insert(seriesRows)
    if (error) throw new Error(`Séries : ${error.message}`)
    console.log('✅ Séries sauvegardées :', seriesRows.length, 'lignes')
  }

  return savedItems
}

// ══════════════════════════════════════════════════════════════
// Page Séance — saisie NLP multi-passes + templates + coaching
// ══════════════════════════════════════════════════════════════
// Wrapper Suspense requis par Next.js 16 pour useSearchParams
export default function SeancePageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    }>
      <SeancePage />
    </Suspense>
  )
}

function SeancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authLoading, setAuthLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [userUnite, setUserUnite] = useState('kg') // unité du profil

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

  // Coaching IA (violet)
  const [coachingResult, setCoachingResult] = useState(null)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [coachingError, setCoachingError] = useState('')
  const [afterBilan, setAfterBilan] = useState(null)
  const [pendingCoachingBefore, setPendingCoachingBefore] = useState(null) // coaching before en attente de séance

  // Templates
  const [templates, setTemplates] = useState([])
  const [templateChecklist, setTemplateChecklist] = useState(null) // exercices du template en cours
  const [loggedExercices, setLoggedExercices] = useState({}) // { exercice_id: true }
  const [loggingExercice, setLoggingExercice] = useState(null) // exercice actuellement en train d'être logué
  const [seriesForm, setSeriesForm] = useState([]) // [{ reps, poids }]
  const [savingSeries, setSavingSeries] = useState(false)

  // Bilan fin de séance (écran intermédiaire)
  const [isFinishing, setIsFinishing] = useState(false)
  const [bilanDuree, setBilanDuree] = useState('')
  const [bilanCalories, setBilanCalories] = useState('')
  const [bilanRpe, setBilanRpe] = useState(null)
  const [dureeAuto, setDureeAuto] = useState(0)
  const [bilanSaving, setBilanSaving] = useState(false)

  // Toast notifications
  const [toast, setToast] = useState(null) // { message, type: 'success'|'error' }

  // Confirmation séance vide
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false)

  // ── Mode saisie : NLP ou Manuel ──
  const [inputMode, setInputMode] = useState('nlp') // 'nlp' | 'manual'

  // ── Mode manuel : sélecteur exercice ──
  const [catalogue, setCatalogue] = useState([]) // tous les exercices accessibles
  const [manualGroupeFilter, setManualGroupeFilter] = useState('tous')
  const [manualSearch, setManualSearch] = useState('')
  const [selectedExercice, setSelectedExercice] = useState(null) // exercice sélectionné
  const [lastPerformance, setLastPerformance] = useState(null) // dernière perf
  const [lastPerfLoading, setLastPerfLoading] = useState(false)
  const [manualSeries, setManualSeries] = useState([
    { reps: 10, poids: '' },
    { reps: 10, poids: '' },
    { reps: 10, poids: '' },
  ])
  const [manualCardioForm, setManualCardioForm] = useState({
    duree: '', distance: '', calories: '', fc: '', rpe: '',
  })
  const [manualSaving, setManualSaving] = useState(false)

  // ── Afficher un toast temporaire ──
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Détecte si des données non sauvegardées sont en cours ──
  const isDirty = texteInput.trim().length > 0 || status === 'parsed'

  // ── Protection navigation : beforeunload ──
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // ── Protection navigation interne ──
  const safePush = useCallback((url) => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tu as des données non sauvegardées. Quitter cette page ?'
      )
      if (!confirmed) return
    }
    router.push(url)
  }, [isDirty, router])

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUserId(session.user.id)

      // Charger l'unité du profil
      const { data: profil } = await supabase
        .from('profils')
        .select('unite_poids')
        .eq('user_id', session.user.id)
        .single()
      if (profil?.unite_poids) setUserUnite(profil.unite_poids)

      // ── Charger le catalogue exercices (globaux + perso) ──
      const { data: exos } = await supabase
        .from('exercices')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${session.user.id}`)
        .order('nom')
      setCatalogue(exos || [])

      // ── Charger les templates de l'utilisateur ──
      const { data: tpls } = await supabase
        .from('templates')
        .select('*, template_exercices(exercice_id, ordre, exercices(id, nom, categorie, groupe_musculaire))')
        .eq('user_id', session.user.id)
        .order('nom')
      setTemplates(tpls || [])

      // ── Restaurer une séance active depuis localStorage ──
      let restored = false
      try {
        const stored = localStorage.getItem(LS_KEY)
        if (stored) {
          const { seanceId, heure, ctx, templateId } = JSON.parse(stored)
          if (seanceId) {
            const { data: seanceData, error: fetchErr } = await supabase
              .from('seances')
              .select(`
                id, contexte, heure_debut, template_id,
                cardio_blocs(type_cardio, duree_minutes),
                series(exercice_id, num_serie, repetitions, poids_kg, exercices(nom))
              `)
              .eq('id', seanceId)
              .eq('user_id', session.user.id)
              .single()

            if (!fetchErr && seanceData) {
              const restoredItems = []

              for (const bloc of (seanceData.cardio_blocs || [])) {
                restoredItems.push({
                  type: 'cardio',
                  nom: bloc.type_cardio,
                  duree: bloc.duree_minutes,
                })
              }

              const exGroups = {}
              for (const s of (seanceData.series || [])) {
                const eid = s.exercice_id
                if (!exGroups[eid]) {
                  exGroups[eid] = {
                    type: 'exercice',
                    nom: s.exercices?.nom || 'Exercice',
                    series: [],
                  }
                }
                exGroups[eid].series.push({
                  num_serie: s.num_serie,
                  repetitions: s.repetitions,
                  poids_kg: s.poids_kg,
                })
              }
              Object.values(exGroups).forEach((g) => restoredItems.push(g))

              setActiveSeanceId(seanceId)
              setActiveSeanceData(restoredItems)
              setHeureDebut(heure || seanceData.heure_debut)
              setContexte(ctx || seanceData.contexte || 'maison')
              restored = true

              // Restaurer la checklist template si applicable
              if (seanceData.template_id || templateId) {
                const tId = seanceData.template_id || templateId
                const matchingTpl = (tpls || []).find((t) => t.id === tId)
                if (matchingTpl) {
                  const checklist = (matchingTpl.template_exercices || [])
                    .sort((a, b) => a.ordre - b.ordre)
                    .map((te) => ({
                      exercice_id: te.exercice_id,
                      nom: te.exercices?.nom || 'Exercice',
                      groupe_musculaire: te.exercices?.groupe_musculaire || '',
                      categorie: te.exercices?.categorie || '',
                    }))
                  setTemplateChecklist(checklist)

                  // Marquer les exercices déjà logués
                  const logged = {}
                  const loggedIds = [...new Set((seanceData.series || []).map((s) => s.exercice_id))]
                  for (const eid of loggedIds) logged[eid] = true
                  setLoggedExercices(logged)
                }
              }

              console.log('🔄 Séance restaurée depuis localStorage :', seanceId)
            } else {
              localStorage.removeItem(LS_KEY)
              console.log('🧹 Séance expirée, localStorage nettoyé')
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Erreur restauration localStorage :', e)
        localStorage.removeItem(LS_KEY)
      }

      // ── Vérifier si on arrive avec ?template=xxx ──
      if (!restored) {
        const templateParam = searchParams.get('template')
        if (templateParam && tpls) {
          const tpl = tpls.find((t) => t.id === templateParam)
          if (tpl) {
            // Démarrer automatiquement la séance avec ce template
            await startTemplateSession(tpl, session.user.id)
          }
        }
      }

      setAuthLoading(false)
    }
    checkAuth()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // ── Démarrer une séance avec un template ──
  async function startTemplateSession(tpl, uid) {
    const now = new Date()
    const heure = now.toTimeString().split(' ')[0].slice(0, 5)
    const ctx = tpl.contexte || 'maison'

    const { data: seance, error } = await supabase
      .from('seances')
      .insert({
        user_id: uid || userId,
        date: now.toISOString().split('T')[0],
        heure_debut: heure,
        contexte: ctx,
        template_id: tpl.id,
      })
      .select('id')
      .single()

    if (error) {
      console.error('❌ Erreur création séance template :', error.message)
      return
    }

    setActiveSeanceId(seance.id)
    setActiveSeanceData([])
    setHeureDebut(heure)
    setContexte(ctx)

    // Persister le coaching before en attente s'il existe
    if (pendingCoachingBefore) {
      supabase.from('seances').update({ coaching_before: pendingCoachingBefore }).eq('id', seance.id)
        .then(() => console.log('✅ Coaching before persisté (différé, template)'))
        .catch((e) => console.error('⚠️ Persistance coaching before différé échouée :', e))
      setPendingCoachingBefore(null)
    }

    // Construire la checklist depuis les exercices du template
    const checklist = (tpl.template_exercices || [])
      .sort((a, b) => a.ordre - b.ordre)
      .map((te) => ({
        exercice_id: te.exercice_id,
        nom: te.exercices?.nom || 'Exercice',
        groupe_musculaire: te.exercices?.groupe_musculaire || '',
        categorie: te.exercices?.categorie || '',
      }))

    setTemplateChecklist(checklist)
    setLoggedExercices({})

    // Persister dans localStorage
    localStorage.setItem(LS_KEY, JSON.stringify({
      seanceId: seance.id,
      heure,
      ctx,
      templateId: tpl.id,
    }))

    console.log('✅ Séance template démarrée :', tpl.nom)
  }

  // ═══════════════════════════════════════════════════════
  // ── MODE MANUEL : fonctions ──
  // ═══════════════════════════════════════════════════════

  // Labels des groupes musculaires (filtre → label affiché)
  const GROUPE_LABELS = {
    tous: 'Tous',
    pectoraux: 'Pecs',
    dos: 'Dos',
    epaules: 'Épaules',
    biceps: 'Biceps',
    triceps: 'Triceps',
    jambes: 'Jambes',
    abdos: 'Abdos',
    cardio: 'Cardio',
  }

  // Normaliser une chaîne pour comparaison (sans accents, minuscules)
  function normalizeForSearch(str) {
    if (!str) return ''
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  }

  // Filtrer le catalogue par groupe musculaire + recherche
  const filteredCatalogue = catalogue.filter((ex) => {
    // Filtre groupe
    if (manualGroupeFilter !== 'tous') {
      if (manualGroupeFilter === 'cardio') {
        if (ex.categorie !== 'cardio') return false
      } else {
        if (ex.groupe_musculaire !== manualGroupeFilter) return false
      }
    }
    // Filtre recherche
    if (manualSearch.trim()) {
      const searchNorm = normalizeForSearch(manualSearch)
      const nomNorm = normalizeForSearch(ex.nom)
      if (!nomNorm.includes(searchNorm)) return false
    }
    return true
  })

  // Charger la dernière performance pour un exercice
  async function getLastPerformance(exerciceId) {
    setLastPerfLoading(true)
    try {
      // Récupérer les séances de cet utilisateur avec cet exercice
      const { data } = await supabase
        .from('series')
        .select('num_serie, repetitions, poids_kg, seances!inner(date, user_id)')
        .eq('exercice_id', exerciceId)
        .eq('seances.user_id', userId)
        .order('seances(date)', { ascending: false })
        .limit(20)

      if (!data || data.length === 0) {
        setLastPerformance(null)
        setLastPerfLoading(false)
        return null
      }

      // Grouper par la date la plus récente
      const lastDate = data[0].seances.date
      const lastSeries = data
        .filter((s) => s.seances.date === lastDate)
        .sort((a, b) => a.num_serie - b.num_serie)

      const perf = { date: lastDate, series: lastSeries }
      setLastPerformance(perf)
      setLastPerfLoading(false)
      return perf
    } catch (e) {
      console.warn('⚠️ Erreur chargement dernière perf :', e)
      setLastPerformance(null)
      setLastPerfLoading(false)
      return null
    }
  }

  // Formater la dernière performance pour affichage
  function formatLastPerformance(lastPerf) {
    if (!lastPerf) return "Première fois pour cet exercice 💪"

    const { series, date } = lastPerf
    const daysAgo = Math.floor((new Date() - new Date(date)) / 86400000)
    const daysLabel = daysAgo === 0 ? "aujourd'hui"
      : daysAgo === 1 ? "hier"
      : `il y a ${daysAgo}j`

    const allSameReps = series.every((s) => s.repetitions === series[0].repetitions)
    const poids = series[0].poids_kg

    if (allSameReps && poids) {
      return `${series.length}×${series[0].repetitions} × ${toDisplay(poids, userUnite)}${unitLabel(userUnite)} — ${daysLabel}`
    } else if (allSameReps) {
      return `${series.length}×${series[0].repetitions} reps — ${daysLabel}`
    } else {
      const repsStr = series.map((s) => s.repetitions).join(', ')
      const poidsStr = poids ? ` × ${toDisplay(poids, userUnite)}${unitLabel(userUnite)}` : ''
      return `${series.length} séries : ${repsStr}${poidsStr} — ${daysLabel}`
    }
  }

  // Sélectionner un exercice dans le catalogue
  async function handleSelectExercice(ex) {
    setSelectedExercice(ex)
    setManualSaving(false)

    if (ex.categorie === 'cardio') {
      // Formulaire cardio
      setManualCardioForm({ duree: '', distance: '', calories: '', fc: '', rpe: '' })
      setLastPerformance(null)
    } else {
      // Formulaire séries — charger la dernière perf
      const perf = await getLastPerformance(ex.id)
      if (perf && perf.series.length > 0) {
        // Pré-remplir avec la dernière performance
        setManualSeries(perf.series.map((s) => ({
          reps: s.repetitions,
          poids: s.poids_kg != null ? String(toDisplay(s.poids_kg, userUnite)) : '',
        })))
      } else {
        // 3 séries vides par défaut
        setManualSeries([
          { reps: 10, poids: '' },
          { reps: 10, poids: '' },
          { reps: 10, poids: '' },
        ])
      }
    }
  }

  // Retour au sélecteur
  function handleBackToSelector() {
    setSelectedExercice(null)
    setLastPerformance(null)
    setManualSeries([{ reps: 10, poids: '' }, { reps: 10, poids: '' }, { reps: 10, poids: '' }])
    setManualCardioForm({ duree: '', distance: '', calories: '', fc: '', rpe: '' })
  }

  // Ajouter une série au formulaire manuel
  function handleAddManualSerieRow() {
    if (manualSeries.length >= 10) return
    const last = manualSeries[manualSeries.length - 1]
    setManualSeries((prev) => [...prev, { reps: last?.reps || 10, poids: last?.poids || '' }])
  }

  // Retirer une série du formulaire manuel
  function handleRemoveManualSerieRow(index) {
    if (manualSeries.length <= 1) return
    setManualSeries((prev) => prev.filter((_, i) => i !== index))
  }

  // Mettre à jour une série dans le formulaire manuel
  function updateManualSerieForm(index, field, value) {
    setManualSeries((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // Créer ou réutiliser la séance active
  async function ensureSeance() {
    if (activeSeanceId) return activeSeanceId

    const now = new Date()
    const heure = now.toTimeString().split(' ')[0].slice(0, 5)

    const { data: newSeance, error } = await supabase
      .from('seances')
      .insert({
        user_id: userId,
        date: now.toISOString().split('T')[0],
        heure_debut: heure,
        contexte: contexte,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Séance : ${error.message}`)

    const seanceId = newSeance.id
    setActiveSeanceId(seanceId)
    setHeureDebut(heure)

    // Persister le coaching before en attente
    if (pendingCoachingBefore) {
      supabase.from('seances').update({ coaching_before: pendingCoachingBefore }).eq('id', seanceId)
        .then(() => console.log('✅ Coaching before persisté (différé, manuel)'))
        .catch((e) => console.error('⚠️ Persistance coaching before différé échouée :', e))
      setPendingCoachingBefore(null)
    }

    localStorage.setItem(LS_KEY, JSON.stringify({ seanceId, heure, ctx: contexte }))
    console.log('✅ Séance créée (mode manuel) :', seanceId)
    return seanceId
  }

  // Sauvegarder un exercice muscu depuis le formulaire manuel
  async function saveManualExercice() {
    if (!selectedExercice || !userId) return
    setManualSaving(true)

    try {
      const seanceId = await ensureSeance()

      // Calculer l'ordre (après les exercices déjà enregistrés)
      const { data: existingSeries } = await supabase
        .from('series')
        .select('ordre')
        .eq('seance_id', seanceId)
      const maxOrdre = (existingSeries || []).reduce((max, s) => Math.max(max, s.ordre || 0), -1)

      const rows = manualSeries.map((s, i) => {
        const poidsVal = s.poids !== '' && s.poids !== null && s.poids !== undefined ? parseFloat(s.poids) : null
        return {
          seance_id: seanceId,
          exercice_id: selectedExercice.id,
          ordre: maxOrdre + 1,
          num_serie: i + 1,
          repetitions: parseInt(s.reps) || 0,
          poids_kg: poidsVal != null && !isNaN(poidsVal) ? toKg(poidsVal, userUnite) : null,
        }
      })

      const { error } = await supabase.from('series').insert(rows)
      if (error) throw new Error(error.message)

      console.log('✅ Exercice manuel sauvegardé :', selectedExercice.nom)

      // Ajouter au récap
      setActiveSeanceData((prev) => [...prev, {
        type: 'exercice',
        nom: selectedExercice.nom,
        series: rows.map((r) => ({
          num_serie: r.num_serie,
          repetitions: r.repetitions,
          poids_kg: r.poids_kg,
        })),
      }])

      showToast(`${selectedExercice.nom} ajouté ✅`)
      handleBackToSelector()
    } catch (err) {
      console.error('❌ Erreur sauvegarde manuelle :', err)
      showToast('Erreur : ' + err.message, 'error')
    }
    setManualSaving(false)
  }

  // Sauvegarder un cardio depuis le formulaire manuel
  async function saveManualCardio() {
    if (!selectedExercice || !userId) return
    if (!manualCardioForm.duree) return
    setManualSaving(true)

    try {
      const seanceId = await ensureSeance()

      // Calculer l'ordre cardio
      const { data: existingCardio } = await supabase
        .from('cardio_blocs')
        .select('ordre')
        .eq('seance_id', seanceId)
      const maxOrdre = (existingCardio || []).reduce((max, c) => Math.max(max, c.ordre || 0), -1)

      const { error } = await supabase.from('cardio_blocs').insert({
        seance_id: seanceId,
        type_cardio: selectedExercice.nom.toLowerCase(),
        duree_minutes: parseInt(manualCardioForm.duree),
        distance_km: manualCardioForm.distance ? parseFloat(manualCardioForm.distance) : null,
        calories: manualCardioForm.calories ? parseInt(manualCardioForm.calories) : null,
        frequence_cardiaque: manualCardioForm.fc ? parseInt(manualCardioForm.fc) : null,
        rpe: manualCardioForm.rpe ? parseInt(manualCardioForm.rpe) : null,
        ordre: maxOrdre + 1,
      })

      if (error) throw new Error(error.message)

      console.log('✅ Cardio manuel sauvegardé :', selectedExercice.nom)

      // Ajouter au récap
      setActiveSeanceData((prev) => [...prev, {
        type: 'cardio',
        nom: selectedExercice.nom,
        duree: parseInt(manualCardioForm.duree),
      }])

      showToast(`${selectedExercice.nom} ajouté ✅`)
      handleBackToSelector()
    } catch (err) {
      console.error('❌ Erreur sauvegarde cardio manuel :', err)
      showToast('Erreur : ' + err.message, 'error')
    }
    setManualSaving(false)
  }

  // ── Ouvrir le formulaire inline pour loguer un exercice du template ──
  function handleOpenLog(ex) {
    setLoggingExercice(ex)
    // Pré-remplir 3 séries par défaut
    setSeriesForm([
      { reps: 10, poids: '' },
      { reps: 10, poids: '' },
      { reps: 10, poids: '' },
    ])
  }

  // ── Ajouter une série au formulaire ──
  function handleAddSerieRow() {
    setSeriesForm((prev) => [...prev, { reps: 10, poids: '' }])
  }

  // ── Retirer une série du formulaire ──
  function handleRemoveSerieRow(index) {
    if (seriesForm.length <= 1) return
    setSeriesForm((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Mettre à jour une série dans le formulaire ──
  function updateSerieForm(index, field, value) {
    setSeriesForm((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // ── Sauvegarder les séries depuis le formulaire inline ──
  async function handleSaveSeries() {
    if (!loggingExercice || !activeSeanceId || !userId) return
    setSavingSeries(true)

    try {
      const rows = seriesForm.map((s, i) => {
        const poidsVal = s.poids !== '' && s.poids !== null ? parseFloat(s.poids) : null
        return {
          seance_id: activeSeanceId,
          exercice_id: loggingExercice.exercice_id,
          ordre: Object.keys(loggedExercices).length,
          num_serie: i + 1,
          repetitions: parseInt(s.reps) || 0,
          poids_kg: poidsVal != null ? toKg(poidsVal, userUnite) : null,
        }
      })

      const { error } = await supabase.from('series').insert(rows)
      if (error) throw new Error(error.message)

      console.log('✅ Séries logées pour', loggingExercice.nom)

      // Marquer comme logué
      setLoggedExercices((prev) => ({ ...prev, [loggingExercice.exercice_id]: true }))

      // Ajouter au récap
      setActiveSeanceData((prev) => [...prev, {
        type: 'exercice',
        nom: loggingExercice.nom,
        series: seriesForm.map((s, i) => ({
          num_serie: i + 1,
          repetitions: parseInt(s.reps) || 0,
          poids_kg: s.poids !== '' && s.poids !== null ? toKg(parseFloat(s.poids), userUnite) : null,
        })),
      }])

      setLoggingExercice(null)
      setSeriesForm([])
    } catch (err) {
      console.error('❌ Erreur sauvegarde séries template :', err)
    }
    setSavingSeries(false)
  }

  // ── Charger contexte coaching ──
  async function loadCoachingContext() {
    const { data: profil } = await supabase
      .from('profils')
      .select('*')
      .eq('user_id', userId)
      .single()

    const { data: historique } = await supabase
      .from('seances')
      .select(`
        id, date, contexte, duree_totale,
        cardio_blocs(type_cardio, duree_minutes, rpe, calories),
        series(num_serie, repetitions, poids_kg, exercices(nom, categorie, groupe_musculaire))
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(10)

    let seanceEnCours = null
    if (activeSeanceId) {
      const { data } = await supabase
        .from('seances')
        .select(`
          id, date, contexte, heure_debut, duree_totale,
          cardio_blocs(type_cardio, duree_minutes, rpe, calories),
          series(num_serie, repetitions, poids_kg, exercices(nom, categorie, groupe_musculaire))
        `)
        .eq('id', activeSeanceId)
        .single()
      if (data) seanceEnCours = data
    }

    return { profil, historique: historique || [], seanceEnCours }
  }

  // ── Appel coaching IA ──
  async function handleCoaching(mode) {
    setCoachingLoading(true)
    setCoachingError('')
    setCoachingResult(null)

    try {
      const { profil, historique, seanceEnCours } = await loadCoachingContext()

      if (!profil) {
        setCoachingError('Remplis ton profil pour un coaching personnalisé.')
        setCoachingLoading(false)
        return
      }

      const res = await fetch('/api/coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          profil,
          historique,
          seanceEnCours,
          contexte,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setCoachingError(data.error || 'Erreur coaching.')
        setCoachingLoading(false)
        return
      }

      setCoachingResult(data)

      // ── Persister le coaching en DB (fire-and-forget) ──
      if (data.message) {
        if (mode === 'before') {
          // Before est appelé avant création de séance → stocker pour persister plus tard
          if (activeSeanceId) {
            supabase.from('seances').update({ coaching_before: data.message }).eq('id', activeSeanceId)
              .then(() => console.log('✅ Coaching before persisté'))
              .catch((e) => console.error('⚠️ Persistance coaching before échouée :', e))
          } else {
            setPendingCoachingBefore(data.message)
          }
        } else if (mode === 'during' && activeSeanceId) {
          // Concaténer les during successifs avec séparateur
          try {
            const { data: current } = await supabase
              .from('seances')
              .select('coaching_during')
              .eq('id', activeSeanceId)
              .single()
            const updated = current?.coaching_during
              ? current.coaching_during + '\n\n---\n\n' + data.message
              : data.message
            await supabase
              .from('seances')
              .update({ coaching_during: updated })
              .eq('id', activeSeanceId)
            console.log('✅ Coaching during persisté')
          } catch (e) {
            console.error('⚠️ Persistance coaching during échouée :', e)
          }
        }
      }
    } catch (err) {
      setCoachingError('Erreur réseau coaching.')
    }
    setCoachingLoading(false)
  }

  // ── Utiliser le plan suggéré par le coach ──
  function handleUsePlan(plan) {
    if (!plan || plan.length === 0) return

    const lines = plan.map((item) => {
      if (item.type === 'cardio') {
        let s = `${item.nom} ${item.duree_minutes} min`
        if (item.rpe_cible) s += ` RPE ${item.rpe_cible}`
        return s
      }
      let s = item.nom
      if (item.poids_suggere) {
        s += ` ${item.poids_suggere}${item.poids_unite || 'kg'}`
      }
      s += ` ${item.series_suggerees}x${item.reps_suggerees}`
      return s
    })

    const texte = lines.join(', ')
    setTexteInput(texte)
    setCoachingResult(null)

    setTimeout(async () => {
      setStatus('loading')
      setErrorMsg('')
      try {
        const res = await fetch('/api/parse-seance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texte }),
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
        setErrorMsg('Erreur réseau.')
        setStatus('error')
      }
    }, 100)
  }

  // ── Appel API parse-seance ──
  async function handleAnalyze() {
    if (!texteInput.trim() || texteInput.trim().length < 5) return
    if (status === 'loading') return // protection double-clic

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

  // ── Retour textarea ──
  function handleModify() {
    setStatus('idle')
    setParseResult(null)
  }

  // ── PREMIÈRE PASSE : créer la séance + sauvegarder ──
  async function handleConfirm() {
    if (!parseResult || !userId) return

    setStatus('saving')
    setErrorMsg('')

    try {
      const now = new Date()
      const heure = now.toTimeString().split(' ')[0].slice(0, 5)

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

      // Persister le coaching before en attente s'il existe
      if (pendingCoachingBefore) {
        supabase.from('seances').update({ coaching_before: pendingCoachingBefore }).eq('id', seanceId)
          .then(() => console.log('✅ Coaching before persisté (différé)'))
          .catch((e) => console.error('⚠️ Persistance coaching before différé échouée :', e))
        setPendingCoachingBefore(null)
      }

      const savedItems = await saveParseResult(parseResult, seanceId, userId)

      setActiveSeanceId(seanceId)
      setActiveSeanceData(savedItems)
      setHeureDebut(heure)
      setTexteInput('')
      setParseResult(null)
      setStatus('idle')
      showToast('Exercices ajoutés à la séance !')

      localStorage.setItem(LS_KEY, JSON.stringify({
        seanceId,
        heure,
        ctx: contexte,
      }))

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

      const savedItems = await saveParseResult(parseResult, activeSeanceId, userId)

      setActiveSeanceData((prev) => [...prev, ...savedItems])
      setTexteInput('')
      setParseResult(null)
      setStatus('idle')
      showToast('Exercices ajoutés à la séance !')

      localStorage.setItem(LS_KEY, JSON.stringify({
        seanceId: activeSeanceId,
        heure: heureDebut,
        ctx: contexte,
      }))

    } catch (err) {
      console.error('❌ Erreur ajout :', err)
      setErrorMsg(err.message || 'Erreur lors de l\'ajout.')
      setStatus('parsed')
    }
  }

  // ── TERMINER LA SÉANCE → afficher écran bilan ──
  function handleFinish() {
    if (!activeSeanceId || !heureDebut) return

    // Confirmation si séance vide (aucun exercice/cardio logué)
    if (activeSeanceData.length === 0 && !showEmptyConfirm) {
      setShowEmptyConfirm(true)
      return
    }
    setShowEmptyConfirm(false)

    // Calculer la durée auto depuis heure_debut
    const now = new Date()
    const [h, m] = heureDebut.split(':').map(Number)
    const debut = new Date()
    debut.setHours(h, m, 0, 0)
    const dureeMinutes = Math.round((now - debut) / 60000)
    const autoVal = dureeMinutes > 0 ? dureeMinutes : 1

    setDureeAuto(autoVal)
    setBilanDuree(String(autoVal))
    setBilanCalories('')
    setBilanRpe(null)
    setBilanSaving(false)
    setIsFinishing(true)
  }

  // ── VALIDER LE BILAN → UPDATE séance + coaching after ──
  async function handleValidateBilan() {
    setBilanSaving(true)
    try {
      const dureeVal = parseInt(bilanDuree) || dureeAuto
      const caloriesVal = parseInt(bilanCalories) || null
      const rpeVal = bilanRpe || null

      await supabase
        .from('seances')
        .update({
          duree_totale: dureeVal,
          calories_totales: caloriesVal,
          rpe: rpeVal,
        })
        .eq('id', activeSeanceId)

      console.log('✅ Bilan validé — durée:', dureeVal, 'cal:', caloriesVal, 'RPE:', rpeVal)

      await proceedToCoachingAfter(dureeVal, caloriesVal, rpeVal)
    } catch (err) {
      console.error('❌ Erreur validation bilan :', err)
      setBilanSaving(false)
    }
  }

  // ── PASSER LE BILAN → save durée auto + coaching after ──
  async function handleSkipBilan() {
    setBilanSaving(true)
    try {
      await supabase
        .from('seances')
        .update({ duree_totale: dureeAuto })
        .eq('id', activeSeanceId)

      console.log('✅ Bilan passé — durée auto :', dureeAuto)

      await proceedToCoachingAfter(dureeAuto, null, null)
    } catch (err) {
      console.error('❌ Erreur skip bilan :', err)
      setBilanSaving(false)
    }
  }

  // ── COACHING AFTER + cleanup (commun bilan validé et passé) ──
  async function proceedToCoachingAfter(duree, calories, rpe) {
    // L'écran bilan reste affiché avec l'état loading pendant l'appel
    try {
      const { profil, historique, seanceEnCours } = await loadCoachingContext()
      if (profil) {
        // Enrichir le contexte séance avec les données du bilan
        const enrichedSeance = {
          ...seanceEnCours,
          rpe: rpe || null,
          calories: calories || null,
          duree: duree,
        }

        const res = await fetch('/api/coaching', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'after',
            profil,
            historique,
            seanceEnCours: enrichedSeance,
            contexte,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.message) {
            // Persister coaching after en DB (fire-and-forget)
            supabase
              .from('seances')
              .update({ coaching_after: data.message })
              .eq('id', activeSeanceId)
              .then(() => console.log('✅ Coaching after persisté'))
              .catch((e) => console.error('⚠️ Persistance coaching after échouée :', e))

            localStorage.removeItem(LS_KEY)
            setIsFinishing(false)
            setBilanSaving(false)
            setAfterBilan(data.message)
            setActiveSeanceId(null)
            setActiveSeanceData([])
            setHeureDebut(null)
            setTexteInput('')
            setParseResult(null)
            setStatus('idle')
            setContexte('maison')
            setCoachingResult(null)
            setTemplateChecklist(null)
            setLoggedExercices({})
            return
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Coaching after échoué (non bloquant) :', e)
    }

    // Si coaching after échoue → redirect normal
    setIsFinishing(false)
    setBilanSaving(false)
    localStorage.removeItem(LS_KEY)
    setActiveSeanceId(null)
    setActiveSeanceData([])
    setHeureDebut(null)
    setTexteInput('')
    setParseResult(null)
    setStatus('idle')
    setContexte('maison')
    setCoachingResult(null)
    setTemplateChecklist(null)
    setLoggedExercices({})

    router.push('/')
  }

  // ── Fermer le bilan et rediriger ──
  function handleCloseBilan() {
    setAfterBilan(null)
    router.push('/')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  // ── ÉCRAN BILAN FIN DE SÉANCE (durée + calories + RPE) ──
  if (isFinishing) {
    return (
      <div className="min-h-screen px-4 pt-8 pb-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#f0f0f0' }}>
          📊 Bilan de la séance
        </h1>

        {/* Durée */}
        <div className="mb-5">
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#777' }}>
            ⏱️ Durée (minutes)
          </label>
          <input
            type="number"
            value={bilanDuree}
            onChange={(e) => setBilanDuree(e.target.value)}
            inputMode="numeric"
            className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#f0f0f0',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>

        {/* Calories */}
        <div className="mb-5">
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#777' }}>
            🔥 Calories (Apple Watch)
          </label>
          <input
            type="number"
            value={bilanCalories}
            onChange={(e) => setBilanCalories(e.target.value)}
            inputMode="numeric"
            placeholder="Depuis Apple Watch"
            className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#f0f0f0',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>

        {/* RPE — pills colorées 1-10 */}
        <div className="mb-6">
          <label className="text-xs font-medium mb-2 block" style={{ color: '#777' }}>
            💪 Effort ressenti (RPE)
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
              const isSelected = bilanRpe === val
              const color = RPE_COLORS[val]
              return (
                <button
                  key={val}
                  onClick={() => setBilanRpe(isSelected ? null : val)}
                  disabled={bilanSaving}
                  className="w-9 h-9 rounded-full text-sm font-bold transition-all"
                  style={{
                    background: isSelected ? color : 'transparent',
                    color: isSelected ? '#fff' : '#777',
                    border: `2px solid ${isSelected ? color : 'rgba(255,255,255,0.12)'}`,
                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {val}
                </button>
              )
            })}
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[10px]" style={{ color: '#555' }}>Léger</span>
            <span className="text-[10px]" style={{ color: '#555' }}>Modéré</span>
            <span className="text-[10px]" style={{ color: '#555' }}>Intense</span>
          </div>
        </div>

        {/* Bouton Valider le bilan */}
        <button
          onClick={handleValidateBilan}
          disabled={bilanSaving}
          className="w-full py-3.5 text-sm font-bold text-white disabled:opacity-70 transition-opacity"
          style={{
            background: 'linear-gradient(135deg, #f97316, #dc2626)',
            borderRadius: '10px',
          }}
        >
          {bilanSaving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Validation en cours...
            </span>
          ) : (
            '✅ Valider le bilan'
          )}
        </button>

        {/* Lien Passer */}
        <button
          onClick={handleSkipBilan}
          disabled={bilanSaving}
          className="mt-3 text-sm font-medium text-center py-2 disabled:opacity-50"
          style={{ color: '#555' }}
        >
          Passer →
        </button>
      </div>
    )
  }

  // ── ÉCRAN BILAN POST-SÉANCE (coaching after) ──
  if (afterBilan) {
    return (
      <div className="min-h-screen px-4 pt-8 pb-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#f0f0f0' }}>⚡ Séance terminée</h1>

        <div
          className="rounded-xl px-4 py-5 mb-6"
          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: '#c084fc' }}>
            🧠 Analyse du coach
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e0d4f5' }}>
            {afterBilan}
          </p>
        </div>

        <button
          onClick={handleCloseBilan}
          className="w-full py-3.5 text-sm font-bold rounded-xl transition-colors"
          style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}
        >
          OK, compris 💪
        </button>
      </div>
    )
  }

  // Détecter si on est en mode séance active
  const isActive = activeSeanceId !== null
  const isInputMode = status === 'idle' || status === 'loading' || status === 'error'
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

      {/* ── CHECKLIST TEMPLATE (séance active avec template) ── */}
      {isActive && templateChecklist && isInputMode && (
        <div
          className="rounded-[10px] px-4 py-3 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: '#777' }}>
            📋 Template — {templateChecklist.length} exercices
          </p>

          <div className="flex flex-col gap-1.5">
            {templateChecklist.map((ex) => {
              const isLogged = loggedExercices[ex.exercice_id]
              const isCurrentlyLogging = loggingExercice?.exercice_id === ex.exercice_id

              return (
                <div key={ex.exercice_id}>
                  {/* Ligne exercice */}
                  <div
                    className="flex items-center justify-between py-2 px-2 rounded-lg transition-colors"
                    style={{
                      background: isLogged ? 'rgba(34,197,94,0.06)' : 'transparent',
                      border: isCurrentlyLogging ? '1px solid rgba(249,115,22,0.2)' : '1px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isLogged && (
                        <span className="text-xs" style={{ color: '#22c55e' }}>✅</span>
                      )}
                      <p className="text-sm truncate" style={{ color: isLogged ? '#22c55e' : '#f0f0f0' }}>
                        {ex.nom}
                      </p>
                      {ex.groupe_musculaire && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: '#555' }}>
                          {ex.groupe_musculaire}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => isCurrentlyLogging ? setLoggingExercice(null) : handleOpenLog(ex)}
                      className="text-xs px-2.5 py-1 rounded-md flex-shrink-0 ml-2"
                      style={{
                        background: isLogged ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.12)',
                        color: isLogged ? '#22c55e' : '#f97316',
                      }}
                    >
                      {isCurrentlyLogging ? '▲ Fermer' : isLogged ? '✏️ Modifier' : '📝 Loguer'}
                    </button>
                  </div>

                  {/* ── FORMULAIRE INLINE SÉRIES ── */}
                  {isCurrentlyLogging && (
                    <div
                      className="rounded-lg px-3 py-3 mt-1 mb-1"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {/* En-tête colonnes */}
                      <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>
                        <span className="w-10">Série</span>
                        <span className="flex-1">Reps</span>
                        <span className="flex-1">Poids ({unitLabel(userUnite)})</span>
                        <span className="w-6"></span>
                      </div>

                      {seriesForm.map((serie, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1.5">
                          <span className="w-10 text-xs text-center" style={{ color: '#777' }}>{i + 1}</span>
                          <input
                            type="number"
                            value={serie.reps}
                            onChange={(e) => updateSerieForm(i, 'reps', e.target.value)}
                            className="flex-1 text-sm px-2 py-1.5 rounded-md outline-none text-center"
                            style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
                            min="0"
                          />
                          <input
                            type="number"
                            value={serie.poids}
                            onChange={(e) => updateSerieForm(i, 'poids', e.target.value)}
                            placeholder="PDC"
                            className="flex-1 text-sm px-2 py-1.5 rounded-md outline-none text-center"
                            style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
                            min="0"
                            step="0.5"
                          />
                          <button
                            onClick={() => handleRemoveSerieRow(i)}
                            disabled={seriesForm.length <= 1}
                            className="w-6 text-xs disabled:opacity-20"
                            style={{ color: '#ef4444' }}
                          >×</button>
                        </div>
                      ))}

                      {/* Bouton ajouter une série */}
                      <button
                        onClick={handleAddSerieRow}
                        className="w-full text-xs py-1.5 mt-1 rounded-md"
                        style={{ color: '#777', border: '1px dashed rgba(255,255,255,0.1)' }}
                      >
                        + Ajouter une série
                      </button>

                      {/* Bouton enregistrer */}
                      <button
                        onClick={handleSaveSeries}
                        disabled={savingSeries}
                        className="w-full mt-2 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                      >
                        {savingSeries ? 'Enregistrement...' : '✅ Enregistrer'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── RÉCAP DES EXERCICES DÉJÀ ENREGISTRÉS (hors template checklist) ── */}
      {isActive && activeSeanceData.length > 0 && !templateChecklist && isInputMode && (
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

      {/* ── SECTION TEMPLATES RAPIDES (état idle, pas de séance active) ── */}
      {!isActive && isInputMode && (
        <div className="mb-4">
          {templates.length > 0 ? (
            <>
              <p className="text-xs font-medium mb-2" style={{ color: '#777' }}>
                ⚡ Templates rapides
              </p>
              <div
                className="flex gap-2 overflow-x-auto pb-2"
                style={{ scrollbarWidth: 'none' }}
              >
                {templates.slice(0, 5).map((tpl) => {
                  const ctxC = CONTEXTE_COLORS[tpl.contexte] || CONTEXTE_COLORS.salle
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => startTemplateSession(tpl)}
                      className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f0f0f0',
                      }}
                    >
                      {tpl.nom}
                      <span
                        className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: ctxC.bg, color: ctxC.text }}
                      >
                        {tpl.contexte === 'maison' ? '🏠' : tpl.contexte === 'mixte' ? '🔀' : '🏋️'}
                      </span>
                    </button>
                  )
                })}
              </div>
              {templates.length > 5 && (
                <button
                  onClick={() => safePush('/templates')}
                  className="text-xs mt-1"
                  style={{ color: '#f97316' }}
                >
                  Voir tous →
                </button>
              )}
              <button
                onClick={() => safePush('/templates')}
                className="text-xs mt-1 block"
                style={{ color: '#555' }}
              >
                Gérer mes templates →
              </button>
            </>
          ) : (
            <button
              onClick={() => safePush('/templates')}
              className="text-xs"
              style={{ color: '#555' }}
            >
              📋 Créer un template →
            </button>
          )}
        </div>
      )}

      {/* ── TOGGLE NLP / MANUEL (toujours visible en mode saisie) ── */}
      {isInputMode && (
        <div className="flex gap-0 mb-4" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setInputMode('nlp')}
            className="flex-1 py-2.5 text-sm font-medium transition-all"
            style={{
              background: inputMode === 'nlp' ? 'rgba(249,115,22,0.15)' : 'transparent',
              color: inputMode === 'nlp' ? '#f97316' : '#555',
              borderRight: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            ✍️ Texte libre
          </button>
          <button
            onClick={() => setInputMode('manual')}
            className="flex-1 py-2.5 text-sm font-medium transition-all"
            style={{
              background: inputMode === 'manual' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: inputMode === 'manual' ? '#3b82f6' : '#555',
            }}
          >
            📋 Manuel
          </button>
        </div>
      )}

      {/* ── ZONE DE SAISIE NLP (idle / loading / error) ── */}
      {isInputMode && inputMode === 'nlp' && (
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

          {/* Bouton Analyser — désactivé si vide ou < 5 chars */}
          <button
            onClick={handleAnalyze}
            disabled={status === 'loading' || !texteInput.trim() || texteInput.trim().length < 5}
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

          {/* ── BOUTON COACHING ── */}
          {status !== 'loading' && (
            <button
              onClick={() => handleCoaching(isActive ? 'during' : 'before')}
              disabled={coachingLoading}
              className="w-full mt-3 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(168,85,247,0.1)',
                color: '#c084fc',
                border: '1px solid rgba(168,85,247,0.2)',
              }}
            >
              {coachingLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                  Le coach réfléchit...
                </span>
              ) : isActive ? (
                '🧠 Quoi faire ensuite ?'
              ) : (
                '🧠 Demander un plan au coach'
              )}
            </button>
          )}

          {/* Erreur coaching */}
          {coachingError && (
            <p className="text-xs text-center mt-2" style={{ color: '#c084fc' }}>
              {coachingError}
              {coachingError.includes('profil') && (
                <a href="/profil" className="underline ml-1" style={{ color: '#a855f7' }}>
                  Aller au profil →
                </a>
              )}
            </p>
          )}

          {/* ── RÉSULTAT COACHING (message + plan) ── */}
          {coachingResult && (
            <div
              className="mt-3 rounded-xl px-4 py-4"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              {/* Badge "hors ligne" si fallback */}
              {coachingResult.fallback && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
                  style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }}
                >
                  hors ligne
                </span>
              )}
              <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: '#e0d4f5' }}>
                🧠 {coachingResult.message}
              </p>

              {coachingResult.plan?.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {coachingResult.plan.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-lg px-3 py-2"
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.15)' }}
                    >
                      <p className="text-sm font-medium" style={{ color: '#c084fc' }}>
                        {item.type === 'cardio' ? '🏃' : '💪'} {item.nom}
                        <span className="font-normal text-xs ml-2" style={{ color: '#a78bfa' }}>
                          {item.type === 'cardio'
                            ? `${item.duree_minutes} min${item.rpe_cible ? ` · RPE ${item.rpe_cible}` : ''}`
                            : `${item.series_suggerees}×${item.reps_suggerees}${item.poids_suggere ? ` × ${item.poids_suggere} ${item.poids_unite || 'kg'}` : ''}`
                          }
                        </span>
                      </p>
                      {item.raison && (
                        <p className="text-xs mt-0.5" style={{ color: '#8b7ab8' }}>{item.raison}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {coachingResult.plan?.length > 0 && (
                <button
                  onClick={() => handleUsePlan(coachingResult.plan)}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors"
                  style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}
                >
                  {isActive ? '➕ Ajouter ces suggestions' : 'Utiliser ce plan →'}
                </button>
              )}

              <button
                onClick={() => setCoachingResult(null)}
                className="w-full mt-2 py-2 text-xs rounded-lg"
                style={{ color: '#8b7ab8' }}
              >
                Fermer
              </button>
            </div>
          )}

          {/* Bouton Terminer la séance (seulement si séance active) */}
          {isActive && (
            <div className="mt-4">
              {/* Alerte confirmation séance vide */}
              {showEmptyConfirm && (
                <div
                  className="rounded-[10px] px-4 py-3 mb-3 text-center"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}
                >
                  <p className="text-sm mb-2" style={{ color: '#eab308' }}>
                    Tu n'as rien enregistré. Terminer quand même ?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleFinish}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      Oui, terminer
                    </button>
                    <button
                      onClick={() => setShowEmptyConfirm(false)}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#999', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {!showEmptyConfirm && (
                <button
                  onClick={handleFinish}
                  className="w-full py-3 text-sm font-semibold rounded-[10px] transition-colors"
                  style={{ background: 'transparent', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  ✅ Terminer la séance
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ZONE DE SAISIE MANUEL ── */}
      {isInputMode && inputMode === 'manual' && (
        <div>
          {!selectedExercice ? (
            /* ── SÉLECTEUR D'EXERCICE ── */
            <div>
              <p className="text-sm font-semibold mb-3" style={{ color: '#3b82f6' }}>
                📋 Ajouter un exercice
              </p>

              {/* Pills groupes musculaires */}
              <div
                className="flex gap-1.5 overflow-x-auto pb-2 mb-3"
                style={{ scrollbarWidth: 'none' }}
              >
                {Object.entries(GROUPE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setManualGroupeFilter(key)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
                    style={{
                      background: manualGroupeFilter === key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                      color: manualGroupeFilter === key ? '#3b82f6' : '#777',
                      border: `1px solid ${manualGroupeFilter === key ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Recherche */}
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="🔍 Rechercher un exercice..."
                className="w-full text-sm px-3 py-2.5 rounded-lg outline-none mb-3"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#f0f0f0',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: '16px',
                }}
              />

              {/* Liste exercices */}
              <div
                className="rounded-[10px] overflow-y-auto"
                style={{
                  maxHeight: '300px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {filteredCatalogue.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: '#555' }}>
                    Aucun exercice trouvé
                  </p>
                ) : (
                  filteredCatalogue.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelectExercice(ex)}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                          {ex.nom}
                        </span>
                        {ex.source === 'ia_infere' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                            🧠
                          </span>
                        )}
                        {ex.is_custom && ex.source !== 'ia_infere' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>
                            ✏️
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: '#555' }}>
                        {ex.categorie === 'cardio' ? 'cardio' : ex.groupe_musculaire || ex.categorie || ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : selectedExercice.categorie === 'cardio' ? (
            /* ── FORMULAIRE CARDIO ── */
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                  🏃 {selectedExercice.nom}
                </p>
                <button
                  onClick={handleBackToSelector}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ color: '#777', background: 'rgba(255,255,255,0.06)' }}
                >
                  ← Retour
                </button>
              </div>

              {/* Durée (obligatoire) */}
              <div className="mb-3">
                <label className="text-xs mb-1 block" style={{ color: '#777' }}>Durée (min) *</label>
                <input
                  type="number"
                  value={manualCardioForm.duree}
                  onChange={(e) => setManualCardioForm((f) => ({ ...f, duree: e.target.value }))}
                  inputMode="numeric"
                  placeholder="20"
                  className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>

              {/* Distance */}
              <div className="mb-3">
                <label className="text-xs mb-1 block" style={{ color: '#555' }}>Distance (km)</label>
                <input
                  type="number"
                  value={manualCardioForm.distance}
                  onChange={(e) => setManualCardioForm((f) => ({ ...f, distance: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Optionnel"
                  className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>

              {/* Calories */}
              <div className="mb-3">
                <label className="text-xs mb-1 block" style={{ color: '#555' }}>Calories</label>
                <input
                  type="number"
                  value={manualCardioForm.calories}
                  onChange={(e) => setManualCardioForm((f) => ({ ...f, calories: e.target.value }))}
                  inputMode="numeric"
                  placeholder="Optionnel"
                  className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>

              {/* FC */}
              <div className="mb-3">
                <label className="text-xs mb-1 block" style={{ color: '#555' }}>FC moyenne (bpm)</label>
                <input
                  type="number"
                  value={manualCardioForm.fc}
                  onChange={(e) => setManualCardioForm((f) => ({ ...f, fc: e.target.value }))}
                  inputMode="numeric"
                  placeholder="Optionnel"
                  className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>

              {/* RPE */}
              <div className="mb-4">
                <label className="text-xs mb-1 block" style={{ color: '#555' }}>RPE (/10)</label>
                <input
                  type="number"
                  value={manualCardioForm.rpe}
                  onChange={(e) => setManualCardioForm((f) => ({ ...f, rpe: e.target.value }))}
                  inputMode="numeric"
                  min="1"
                  max="10"
                  placeholder="Optionnel"
                  className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>

              {/* Bouton enregistrer */}
              <button
                onClick={saveManualCardio}
                disabled={manualSaving || !manualCardioForm.duree}
                className="w-full py-3 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', borderRadius: '10px' }}
              >
                {manualSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </span>
                ) : (
                  '✅ Enregistrer'
                )}
              </button>
            </div>
          ) : (
            /* ── FORMULAIRE SÉRIES (exercice muscu/poids corps) ── */
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                  💪 {selectedExercice.nom}
                </p>
                <button
                  onClick={handleBackToSelector}
                  className="text-xs px-2 py-1 rounded-md"
                  style={{ color: '#777', background: 'rgba(255,255,255,0.06)' }}
                >
                  ← Retour
                </button>
              </div>

              {/* Dernière performance */}
              {lastPerfLoading ? (
                <div className="mb-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-xs" style={{ color: '#555' }}>Chargement...</p>
                </div>
              ) : (
                <div
                  className="mb-3 py-2 px-3 rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderLeft: '3px solid rgba(59,130,246,0.4)',
                  }}
                >
                  <p className="text-xs italic" style={{ color: '#777' }}>
                    {formatLastPerformance(lastPerformance)}
                  </p>
                </div>
              )}

              {/* En-tête colonnes */}
              <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>
                <span className="w-10">Série</span>
                <span className="flex-1">Reps</span>
                <span className="flex-1">Poids ({unitLabel(userUnite)})</span>
                <span className="w-6"></span>
              </div>

              {/* Séries */}
              {manualSeries.map((serie, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <span className="w-10 text-xs text-center" style={{ color: '#777' }}>{i + 1}</span>
                  <input
                    type="number"
                    value={serie.reps}
                    onChange={(e) => updateManualSerieForm(i, 'reps', e.target.value)}
                    className="flex-1 text-sm px-2 py-2 rounded-md outline-none text-center"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px', minHeight: '44px' }}
                    inputMode="numeric"
                    min="1"
                  />
                  <span className="text-xs" style={{ color: '#555' }}>×</span>
                  <input
                    type="number"
                    value={serie.poids}
                    onChange={(e) => updateManualSerieForm(i, 'poids', e.target.value)}
                    placeholder="PDC"
                    className="flex-1 text-sm px-2 py-2 rounded-md outline-none text-center"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px', minHeight: '44px' }}
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                  />
                  <span className="text-[10px]" style={{ color: '#555' }}>{unitLabel(userUnite)}</span>
                  <button
                    onClick={() => handleRemoveManualSerieRow(i)}
                    disabled={manualSeries.length <= 1}
                    className="w-6 text-xs disabled:opacity-20"
                    style={{ color: '#ef4444' }}
                  >×</button>
                </div>
              ))}

              {/* Ajouter une série */}
              {manualSeries.length < 10 && (
                <button
                  onClick={handleAddManualSerieRow}
                  className="w-full text-xs py-2 mt-1 mb-3 rounded-md"
                  style={{ color: '#777', border: '1px dashed rgba(255,255,255,0.1)' }}
                >
                  + Ajouter une série
                </button>
              )}

              {/* Bouton enregistrer */}
              <button
                onClick={saveManualExercice}
                disabled={manualSaving}
                className="w-full py-3 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', borderRadius: '10px' }}
              >
                {manualSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </span>
                ) : (
                  '✅ Enregistrer'
                )}
              </button>
            </div>
          )}

          {/* Bouton Coaching (aussi disponible en mode manuel) */}
          {!selectedExercice && (
            <button
              onClick={() => handleCoaching(isActive ? 'during' : 'before')}
              disabled={coachingLoading}
              className="w-full mt-3 py-3 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(168,85,247,0.1)',
                color: '#c084fc',
                border: '1px solid rgba(168,85,247,0.2)',
              }}
            >
              {coachingLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                  Le coach réfléchit...
                </span>
              ) : isActive ? (
                '🧠 Quoi faire ensuite ?'
              ) : (
                '🧠 Demander un plan au coach'
              )}
            </button>
          )}

          {/* Erreur coaching */}
          {coachingError && !selectedExercice && (
            <p className="text-xs text-center mt-2" style={{ color: '#c084fc' }}>
              {coachingError}
            </p>
          )}

          {/* Résultat coaching (si en mode manuel sans exercice sélectionné) */}
          {coachingResult && !selectedExercice && (
            <div
              className="mt-3 rounded-xl px-4 py-4"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              {coachingResult.fallback && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
                  style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }}
                >
                  hors ligne
                </span>
              )}
              <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: '#e0d4f5' }}>
                🧠 {coachingResult.message}
              </p>
              <button
                onClick={() => setCoachingResult(null)}
                className="w-full mt-2 py-2 text-xs rounded-lg"
                style={{ color: '#8b7ab8' }}
              >
                Fermer
              </button>
            </div>
          )}

          {/* Bouton Terminer la séance (aussi en mode manuel) */}
          {isActive && !selectedExercice && (
            <div className="mt-4">
              {showEmptyConfirm && (
                <div
                  className="rounded-[10px] px-4 py-3 mb-3 text-center"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}
                >
                  <p className="text-sm mb-2" style={{ color: '#eab308' }}>
                    Tu n'as rien enregistré. Terminer quand même ?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleFinish}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      Oui, terminer
                    </button>
                    <button
                      onClick={() => setShowEmptyConfirm(false)}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#999', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {!showEmptyConfirm && (
                <button
                  onClick={handleFinish}
                  className="w-full py-3 text-sm font-semibold rounded-[10px] transition-colors"
                  style={{ background: 'transparent', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  ✅ Terminer la séance
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ÉCRAN VALIDATION DU PARSING ── */}
      {isParseMode && parseResult && (
        <div>
          <p className="text-base font-semibold mb-4">
            <span style={{ color: '#c084fc' }}>🧠 L'IA a compris :</span>
          </p>

          {parseResult.cardio?.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {parseResult.cardio.map((bloc, i) => (
                <div key={i} className="parse-card" style={{ animationDelay: `${i * 0.08}s` }}>
                  <CardioCard bloc={bloc} />
                </div>
              ))}
            </div>
          )}

          {parseResult.exercices?.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {parseResult.exercices.map((ex, i) => (
                <div key={i} className="parse-card" style={{ animationDelay: `${(i + (parseResult.cardio?.length || 0)) * 0.08}s` }}>
                  <ExerciceCard exercice={ex} />
                </div>
              ))}
            </div>
          )}

          {(!parseResult.cardio || parseResult.cardio.length === 0) && (!parseResult.exercices || parseResult.exercices.length === 0) && (
            <p className="text-sm text-center my-8" style={{ color: '#777' }}>
              Aucun exercice détecté. Essaie de reformuler.
            </p>
          )}

          {errorMsg && (
            <p className="text-sm text-center mb-3" style={{ color: '#ef4444' }}>{errorMsg}</p>
          )}

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

      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div
          className="toast fixed left-4 right-4 bottom-24 z-50 text-center py-3 px-4 rounded-xl text-sm font-semibold"
          style={{
            background: toast.type === 'error'
              ? 'rgba(239,68,68,0.9)'
              : 'rgba(34,197,94,0.9)',
            color: 'white',
            backdropFilter: 'blur(8px)',
          }}
        >
          {toast.type === 'error' ? '❌' : '✅'} {toast.message}
        </div>
      )}
    </div>
  )
}
