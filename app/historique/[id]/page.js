'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toKg, toDisplay, unitLabel } from '@/utils/units'
import { resolveExerciceId } from '@/utils/exercice-resolver'
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

const CARDIO_TYPES = ['course', 'velo', 'elliptique', 'tapis', 'stepper', 'spinning', 'rameur', 'corde_a_sauter']

// Couleurs RPE pour affichage badge
const RPE_COLORS = {
  1: '#22c55e', 2: '#22c55e',
  3: '#84cc16', 4: '#84cc16',
  5: '#eab308', 6: '#eab308',
  7: '#f97316', 8: '#f97316',
  9: '#ef4444', 10: '#ef4444',
}

// Couleurs des badges par catégorie
const CATEGORIE_COLORS = {
  musculation: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  poids_corps: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  mobilite: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  autres: { bg: 'rgba(255,255,255,0.08)', text: '#999', border: 'rgba(255,255,255,0.12)' },
}

// Style commun pour les inputs en mode édition
const editInputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#f0f0f0',
  fontSize: 16,
  minHeight: 44,
  padding: '8px 10px',
}

// Suppression d'accents pour recherche
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Pills filtres groupes musculaires
const GROUPE_PILLS = [
  { value: 'tous', label: 'Tous' },
  { value: 'pecs', label: 'Pecs' },
  { value: 'dos', label: 'Dos' },
  { value: 'epaules', label: 'Épaules' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'jambes', label: 'Jambes' },
  { value: 'abdos', label: 'Abdos' },
  { value: 'cardio', label: 'Cardio' },
]

// Constantes pour la création d'exercice
const CATEGORIES_CREATE = [
  { value: 'musculation', label: 'Musculation' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobilite', label: 'Mobilité' },
  { value: 'autres', label: 'Autres' },
]

const GROUPES_CREATE = [
  { value: 'pecs', label: 'Pecs' },
  { value: 'dos', label: 'Dos' },
  { value: 'epaules', label: 'Épaules' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'jambes', label: 'Jambes' },
  { value: 'abdos', label: 'Abdos' },
  { value: 'full_body', label: 'Full body' },
]

const TYPES_CREATE = [
  { value: 'barre', label: 'Barre' },
  { value: 'halteres', label: 'Haltères' },
  { value: 'machine', label: 'Machine' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
]

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

// Formater une date en français lisible
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

// Regrouper les séries par exercice
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
// Page Détail Séance — lecture + mode édition
// ══════════════════════════════════════════════════════════════
export default function SeanceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const seanceId = params.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seance, setSeance] = useState(null)
  const [unite, setUnite] = useState('kg')
  const [profil, setProfil] = useState(null)
  const [prMap, setPrMap] = useState({})
  const [showTexteBrut, setShowTexteBrut] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [userId, setUserId] = useState(null)

  // Coaching IA — blocs repliables
  const [showCoachBefore, setShowCoachBefore] = useState(false)
  const [showCoachDuring, setShowCoachDuring] = useState(false)
  const [showCoachAfter, setShowCoachAfter] = useState(false)

  // Sauver comme template
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateNom, setTemplateNom] = useState('')
  const [templateContexte, setTemplateContexte] = useState('salle')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSuccess, setTemplateSuccess] = useState(false)

  // ═══ MODE ÉDITION ═══
  const [isEditing, setIsEditing] = useState(false)
  const [addMode, setAddMode] = useState(null) // null | 'nlp' | 'manual' | 'cardio'
  const [nlpText, setNlpText] = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [nlpResult, setNlpResult] = useState(null)
  // Ajout manuel
  const [manualExoId, setManualExoId] = useState('')
  const [manualNbSeries, setManualNbSeries] = useState(3)
  const [manualReps, setManualReps] = useState(10)
  const [manualPoids, setManualPoids] = useState('')
  const [exercicesCatalogue, setExercicesCatalogue] = useState([])
  // Ajout cardio manuel
  const [newCardioType, setNewCardioType] = useState('course')
  const [newCardioDuree, setNewCardioDuree] = useState('')
  const [newCardioCalories, setNewCardioCalories] = useState('')
  const [newCardioRpe, setNewCardioRpe] = useState('')

  // ═══ CHANGEMENT D'EXERCICE ═══
  const [changingExerciceFor, setChangingExerciceFor] = useState(null) // null | { oldExerciceId, oldExerciceNom }
  const [groupeFilter, setGroupeFilter] = useState('tous')
  const [searchText, setSearchText] = useState('')
  const [isCreatingExo, setIsCreatingExo] = useState(false)
  const [newExo, setNewExo] = useState({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' })

  // ═══ NOTES DE SÉANCE ═══
  const [notesEdit, setNotesEdit] = useState('')

  // ── Recharger la séance complète ──
  async function reloadSeance() {
    const { data } = await supabase
      .from('seances')
      .select('*, cardio_blocs(*), series(*, exercices(nom, categorie, groupe_musculaire))')
      .eq('id', seanceId)
      .single()

    if (data) setSeance(data)
  }

  // ── Chargement initial ──
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      setUserId(session.user.id)

      const { data: profilData } = await supabase
        .from('profils')
        .select('unite_poids')
        .eq('user_id', session.user.id)
        .single()
      if (profilData?.unite_poids) setUnite(profilData.unite_poids)
      setProfil(profilData)

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

      // ── Calcul des PR ──
      const exerciceIds = [...new Set((seanceData.series || []).map((s) => s.exercice_id))]
      if (exerciceIds.length > 0) {
        const { data: userSeances } = await supabase
          .from('seances')
          .select('id')
          .eq('user_id', session.user.id)
        const userSeanceIds = (userSeances || []).map((s) => s.id)

        const { data: allSeries } = await supabase
          .from('series')
          .select('exercice_id, poids_kg, repetitions')
          .in('exercice_id', exerciceIds)
          .in('seance_id', userSeanceIds)

        const prs = {}
        for (const s of (allSeries || [])) {
          const eid = s.exercice_id
          if (!prs[eid]) prs[eid] = { maxPoids: null, maxReps: null }
          if (s.poids_kg != null) {
            if (prs[eid].maxPoids === null || s.poids_kg > prs[eid].maxPoids) prs[eid].maxPoids = s.poids_kg
          } else {
            if (prs[eid].maxReps === null || s.repetitions > prs[eid].maxReps) prs[eid].maxReps = s.repetitions
          }
        }
        setPrMap(prs)
      }

      setLoading(false)
    }
    load()
  }, [router, seanceId])

  // ── Charger le catalogue exercices pour ajout manuel ──
  useEffect(() => {
    if (!isEditing || !userId) return
    async function loadCatalogue() {
      const { data } = await supabase
        .from('exercices')
        .select('id, nom, groupe_musculaire, categorie, type')
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('nom')
      setExercicesCatalogue(data || [])
    }
    loadCatalogue()
  }, [isEditing, userId])

  // Vérifier si une série est un PR
  function isPR(serie) {
    const pr = prMap[serie.exercice_id]
    if (!pr) return false
    if (serie.poids_kg != null) return serie.poids_kg === pr.maxPoids
    return serie.repetitions === pr.maxReps
  }

  // ═══════════════════════════════════════════
  // FONCTIONS D'ÉDITION
  // ═══════════════════════════════════════════

  // ── Mettre à jour une série (onBlur) ──
  async function updateSerie(serieId, field, value) {
    let dbValue = value
    if (field === 'poids_kg' && profil?.unite_poids === 'lbs') {
      dbValue = toKg(parseFloat(value), 'lbs')
    }
    if (field === 'poids_kg' || field === 'repetitions') {
      dbValue = dbValue === '' || dbValue === null ? null : parseFloat(dbValue)
    }

    const { error } = await supabase
      .from('series')
      .update({ [field]: dbValue })
      .eq('id', serieId)

    if (error) console.error('Erreur update série:', error)

    // Update local state
    setSeance(prev => ({
      ...prev,
      series: prev.series.map(s =>
        s.id === serieId ? { ...s, [field]: dbValue } : s
      )
    }))
  }

  // ── Supprimer une série ──
  async function deleteSerie(serieId) {
    if (!confirm('Supprimer cette série ?')) return

    const { error } = await supabase
      .from('series')
      .delete()
      .eq('id', serieId)

    if (!error) {
      setSeance(prev => ({
        ...prev,
        series: prev.series.filter(s => s.id !== serieId)
      }))
    }
  }

  // ── Ajouter une série à un exercice existant ──
  async function addSerie(exerciceId, ordre) {
    const lastSerie = seance.series
      .filter(s => s.exercice_id === exerciceId)
      .sort((a, b) => b.num_serie - a.num_serie)[0]

    const newSerie = {
      seance_id: seance.id,
      exercice_id: exerciceId,
      ordre: ordre,
      num_serie: (lastSerie?.num_serie || 0) + 1,
      repetitions: lastSerie?.repetitions || 10,
      poids_kg: lastSerie?.poids_kg || null,
    }

    const { data, error } = await supabase
      .from('series')
      .insert(newSerie)
      .select('*, exercices(nom, groupe_musculaire, categorie)')
      .single()

    if (data) {
      setSeance(prev => ({
        ...prev,
        series: [...prev.series, data]
      }))
    }
  }

  // ── Mettre à jour un bloc cardio ──
  async function updateCardio(blocId, field, value) {
    const dbValue = value === '' ? null : (isNaN(value) ? value : parseFloat(value))

    const { error } = await supabase
      .from('cardio_blocs')
      .update({ [field]: dbValue })
      .eq('id', blocId)

    if (error) console.error('Erreur update cardio:', error)

    setSeance(prev => ({
      ...prev,
      cardio_blocs: prev.cardio_blocs.map(b =>
        b.id === blocId ? { ...b, [field]: dbValue } : b
      )
    }))
  }

  // ── Supprimer un bloc cardio ──
  async function deleteCardio(blocId) {
    if (!confirm('Supprimer ce bloc cardio ?')) return

    const { error } = await supabase
      .from('cardio_blocs')
      .delete()
      .eq('id', blocId)

    if (!error) {
      setSeance(prev => ({
        ...prev,
        cardio_blocs: prev.cardio_blocs.filter(b => b.id !== blocId)
      }))
    }
  }

  // ── Ajouter un bloc cardio manuellement ──
  async function addCardioBloc() {
    if (!newCardioDuree) return

    const newBloc = {
      seance_id: seance.id,
      type_cardio: newCardioType,
      duree_minutes: parseInt(newCardioDuree),
      calories: newCardioCalories ? parseInt(newCardioCalories) : null,
      rpe: newCardioRpe ? parseInt(newCardioRpe) : null,
      ordre: (seance.cardio_blocs?.length || 0),
    }

    const { data: inserted, error } = await supabase
      .from('cardio_blocs')
      .insert(newBloc)
      .select()
      .single()

    if (inserted) {
      setSeance(prev => ({
        ...prev,
        cardio_blocs: [...(prev.cardio_blocs || []), inserted]
      }))
      setNewCardioDuree('')
      setNewCardioCalories('')
      setNewCardioRpe('')
      setAddMode(null)
    }
  }

  // ═══ CHANGEMENT D'EXERCICE ═══

  // ── Sélection d'un exercice existant → UPDATE toutes les séries du bloc ──
  async function handleChangeExercice(newExerciceId, newExercice) {
    const oldExerciceId = changingExerciceFor.oldExerciceId

    const { error } = await supabase
      .from('series')
      .update({ exercice_id: newExerciceId })
      .eq('seance_id', seance.id)
      .eq('exercice_id', oldExerciceId)

    if (!error) {
      // Optimistic update : mettre à jour l'état local
      setSeance(prev => ({
        ...prev,
        series: prev.series.map(s =>
          s.exercice_id === oldExerciceId
            ? { ...s, exercice_id: newExerciceId, exercices: newExercice }
            : s
        )
      }))
      // Fermer le sélecteur
      setChangingExerciceFor(null)
      setGroupeFilter('tous')
      setSearchText('')
      setIsCreatingExo(false)
    } else {
      console.error('Erreur changement exercice:', error)
    }
  }

  // ── Créer un exercice et l'utiliser comme remplacement ──
  async function handleCreateAndUse() {
    if (!newExo.nom.trim()) return

    const normalizedCategorie = removeAccents(newExo.categorie.toLowerCase()).replace(/\s+/g, '_')
    const normalizedGroupe = removeAccents(newExo.groupe_musculaire.toLowerCase()).replace(/\s+/g, '_')

    const { data: created, error } = await supabase
      .from('exercices')
      .insert({
        nom: newExo.nom.trim(),
        categorie: normalizedCategorie,
        groupe_musculaire: normalizedGroupe,
        type: newExo.type,
        is_custom: true,
        source: 'manuel',
        user_id: userId,
      })
      .select()
      .single()

    if (created) {
      // Ajouter au catalogue local
      setExercicesCatalogue(prev => [...prev, created])
      // Utiliser comme remplacement
      await handleChangeExercice(created.id, created)
      // Reset formulaire
      setIsCreatingExo(false)
      setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' })
    } else {
      console.error('Erreur création exercice:', error)
    }
  }

  // ── Mettre à jour une métadonnée de la séance ──
  async function updateSeanceMeta(field, value) {
    const { error } = await supabase
      .from('seances')
      .update({ [field]: value })
      .eq('id', seance.id)

    if (error) console.error('Erreur update séance:', error)

    setSeance(prev => ({ ...prev, [field]: value }))
  }

  // ── NLP : Analyser le texte ──
  async function handleNlpAnalyze() {
    if (nlpText.trim().length < 5) return
    setNlpLoading(true)
    setNlpResult(null)

    try {
      const res = await fetch('/api/parse-seance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: nlpText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur parsing')
      setNlpResult(data)
    } catch (err) {
      console.error('Erreur NLP:', err)
    } finally {
      setNlpLoading(false)
    }
  }

  // ── NLP : Confirmer et sauvegarder les résultats ──
  async function handleNlpConfirm() {
    if (!nlpResult || !userId) return

    // Insérer cardio
    if (nlpResult.seance?.cardio?.length > 0) {
      const cardioRows = nlpResult.seance.cardio.map((c, i) => ({
        seance_id: seance.id,
        type_cardio: c.type,
        duree_minutes: c.duree,
        calories: c.calories || null,
        rpe: c.rpe || null,
        distance_km: c.distance || null,
        frequence_cardiaque: c.fc || null,
        ordre: (seance.cardio_blocs?.length || 0) + i,
      }))
      await supabase.from('cardio_blocs').insert(cardioRows)
    }

    // Insérer exercices + séries (avec auto-learning)
    if (nlpResult.seance?.exercices?.length > 0) {
      for (const exo of nlpResult.seance.exercices) {
        const exerciceId = await resolveExerciceId(exo, userId)
        if (!exerciceId) continue

        const seriesRows = (exo.series || []).map((serie) => ({
          seance_id: seance.id,
          exercice_id: exerciceId,
          ordre: (seance.series?.length || 0) + 1,
          num_serie: serie.num_serie,
          repetitions: serie.repetitions,
          poids_kg: serie.poids_kg || null,
        }))
        if (seriesRows.length > 0) {
          await supabase.from('series').insert(seriesRows)
        }
      }
    }

    // Recharger la séance complète
    await reloadSeance()
    setNlpResult(null)
    setNlpText('')
    setAddMode(null)
  }

  // ── Mode manuel : Ajouter un exercice ──
  async function addManualExercice() {
    if (!manualExoId || !manualNbSeries || !manualReps) return

    const rows = []
    for (let i = 0; i < manualNbSeries; i++) {
      rows.push({
        seance_id: seance.id,
        exercice_id: manualExoId,
        ordre: (seance.series?.length || 0) + 1,
        num_serie: i + 1,
        repetitions: parseInt(manualReps),
        poids_kg: manualPoids ? toKg(parseFloat(manualPoids), profil?.unite_poids || 'kg') : null,
      })
    }

    const { data, error } = await supabase
      .from('series')
      .insert(rows)
      .select('*, exercices(nom, groupe_musculaire, categorie)')

    if (data) {
      setSeance(prev => ({
        ...prev,
        series: [...prev.series, ...data]
      }))
      setManualExoId('')
      setManualPoids('')
      setAddMode(null)
    }
  }

  // ── Supprimer la séance ──
  async function handleDelete() {
    if (!confirm('Es-tu sûr de vouloir supprimer cette séance ?')) return
    setDeleting(true)
    const { error: delError } = await supabase.from('seances').delete().eq('id', seanceId)
    if (delError) { console.error('❌ Erreur suppression :', delError.message); setDeleting(false); return }
    router.push('/historique')
  }

  // ── Sauver comme template ──
  function handleOpenTemplateModal() {
    const dateStr = seance?.date
      ? new Date(seance.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      : ''
    setTemplateNom(`Séance du ${dateStr}`)
    setTemplateContexte(seance?.contexte || 'salle')
    setShowTemplateModal(true)
    setTemplateSuccess(false)
  }

  async function handleSaveAsTemplate() {
    if (!templateNom.trim() || !seance) return
    setSavingTemplate(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: newTpl, error: tplErr } = await supabase
        .from('templates')
        .insert({
          nom: templateNom.trim(),
          contexte: templateContexte,
          source: 'manuel',
          user_id: session.user.id,
        })
        .select()
        .single()

      if (tplErr) throw new Error(tplErr.message)

      const exerciceIds = [...new Set((seance.series || []).map((s) => s.exercice_id))]
      if (exerciceIds.length > 0) {
        const rows = exerciceIds.map((eid, i) => ({
          template_id: newTpl.id,
          exercice_id: eid,
          ordre: i,
        }))
        await supabase.from('template_exercices').insert(rows)
      }
      setTemplateSuccess(true)
    } catch (err) {
      console.error('❌ Erreur création template :', err)
    }
    setSavingTemplate(false)
  }

  // ═══ ÉTATS LOADING / ERREUR ═══

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

  // Catalogue filtré pour le sélecteur de changement d'exercice
  const filteredCatalogue = exercicesCatalogue.filter(ex => {
    // Filtre groupe
    if (groupeFilter === 'cardio') {
      if (ex.categorie !== 'cardio') return false
    } else if (groupeFilter !== 'tous') {
      if (ex.groupe_musculaire !== groupeFilter) return false
    }
    // Filtre recherche
    if (searchText) {
      const search = removeAccents(searchText.toLowerCase())
      const nom = removeAccents(ex.nom.toLowerCase())
      if (!nom.includes(search)) return false
    }
    // Exclure l'exercice actuel
    if (ex.id === changingExerciceFor?.oldExerciceId) return false
    return true
  })

  // ═══ RENDER ═══
  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      {/* Bouton retour */}
      <Link href="/historique" className="text-sm font-medium" style={{ color: '#f97316' }}>
        ← Historique
      </Link>

      {/* ══ BANDE MODE ÉDITION ══ */}
      {isEditing && (
        <div
          className="mt-3 px-4 py-3 rounded-xl flex items-center justify-between"
          style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#f97316' }}>
            ✏️ Modification en cours
          </p>
          <button
            onClick={() => { setIsEditing(false); setAddMode(null) }}
            className="px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
          >
            ✅ Terminé
          </button>
        </div>
      )}

      {/* ══ HEADER ══ */}
      <div className="mt-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <input
                type="date"
                defaultValue={seance.date}
                onBlur={(e) => updateSeanceMeta('date', e.target.value)}
                style={{ ...editInputStyle, width: '100%', maxWidth: 200 }}
              />
            ) : (
              <h1 className="text-xl font-bold" style={{ color: '#f0f0f0' }}>
                {formatDateFr(seance.date)}
              </h1>
            )}

            {isEditing ? (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {/* Contexte toggle */}
                <div className="flex gap-1">
                  {['maison', 'salle'].map(ctx => (
                    <button
                      key={ctx}
                      onClick={() => updateSeanceMeta('contexte', ctx)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{
                        background: seance.contexte === ctx ? '#f97316' : 'rgba(255,255,255,0.06)',
                        color: seance.contexte === ctx ? '#fff' : '#777',
                      }}
                    >
                      {ctx === 'salle' ? '🏋️ Salle' : '🏠 Maison'}
                    </button>
                  ))}
                </div>
                {/* Durée */}
                <div className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: '#777' }}>⏱️</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    defaultValue={seance.duree_totale || ''}
                    onBlur={(e) => updateSeanceMeta('duree_totale', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="min"
                    style={{ ...editInputStyle, width: 60, padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>min</span>
                </div>
                {/* Calories */}
                <div className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: '#777' }}>🔥</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    defaultValue={seance.calories_totales || ''}
                    onBlur={(e) => updateSeanceMeta('calories_totales', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="kcal"
                    style={{ ...editInputStyle, width: 70, padding: '6px 8px' }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs mt-1" style={{ color: '#777' }}>
                {seance.contexte === 'salle' ? '🏋️ Salle' : '🏠 Maison'}
                {seance.heure_debut ? ` · Début ${seance.heure_debut}` : ''}
                {seance.duree_totale ? ` · ⏱️ ${seance.duree_totale} min` : ''}
                {seance.calories_totales ? ` · 🔥 ${seance.calories_totales} kcal` : ''}
              </p>
            )}

            {/* Volume de séance (mode lecture) */}
            {!isEditing && (() => {
              const vol = calcVolumeSeance(seance.series || [])
              if (vol.totalReps === 0) return null
              return (
                <p className="text-[13px] font-semibold mt-1.5" style={{ color: '#f97316' }}>
                  💪 {vol.totalReps} reps
                  {vol.totalCharge > 0 && (
                    <span> · 🏋️ {formatCharge(vol.totalCharge, unite)} soulevés</span>
                  )}
                </p>
              )
            })()}

            {/* RPE */}
            {isEditing ? (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <span className="text-xs mr-1" style={{ color: '#777' }}>💪 RPE</span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => updateSeanceMeta('rpe', seance.rpe === n ? null : n)}
                    className="w-8 h-8 rounded-full text-xs font-bold"
                    style={{
                      background: seance.rpe === n ? RPE_COLORS[n] : 'rgba(255,255,255,0.06)',
                      color: seance.rpe === n ? '#fff' : '#666',
                      border: seance.rpe === n ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              seance.rpe && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: `${RPE_COLORS[seance.rpe]}20`,
                      color: RPE_COLORS[seance.rpe],
                      border: `1px solid ${RPE_COLORS[seance.rpe]}40`,
                    }}
                  >
                    💪 RPE {seance.rpe}/10
                  </span>
                </div>
              )
            )}
          </div>

          {/* Bouton éditer (mode lecture) */}
          {!isEditing && (
            <button
              onClick={() => { setIsEditing(true); setNotesEdit(seance.notes || '') }}
              className="text-xs px-3 py-2 rounded-lg font-medium"
              style={{ color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
            >
              ✏️ Modifier
            </button>
          )}
        </div>
      </div>

      {/* ══ NOTES DE SÉANCE ══ */}
      {isEditing ? (
        <div className="mb-5">
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#777' }}>
            📝 Notes
          </label>
          <textarea
            value={notesEdit}
            onChange={e => setNotesEdit(e.target.value)}
            onBlur={async () => {
              const newNotes = notesEdit.trim() || null
              if (newNotes === (seance.notes || null)) return
              await supabase.from('seances').update({ notes: newNotes }).eq('id', seance.id)
              setSeance(prev => ({ ...prev, notes: newNotes }))
            }}
            rows={2}
            placeholder="Ressenti, conditions, remarques..."
            className="w-full text-sm px-3 py-2.5 rounded-lg outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#f0f0f0',
              border: '1px solid rgba(255,255,255,0.15)',
              fontSize: 16,
            }}
          />
        </div>
      ) : (
        seance.notes && (
          <div
            className="mb-5 px-3 py-2.5 rounded-lg"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderLeft: '3px solid #777',
            }}
          >
            <p className="text-sm italic" style={{ color: '#aaa' }}>
              📝 {seance.notes}
            </p>
          </div>
        )
      )}

      {/* ══ SECTION CARDIO ══ */}
      {(seance.cardio_blocs?.length > 0 || isEditing) && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#777' }}>
            Cardio
          </p>
          <div className="flex flex-col gap-2">
            {(seance.cardio_blocs || []).map((bloc) => (
              <div
                key={bloc.id}
                className="rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: isEditing ? '1px dashed rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {isEditing ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <select
                        defaultValue={bloc.type_cardio}
                        onChange={(e) => updateCardio(bloc.id, 'type_cardio', e.target.value)}
                        style={{ ...editInputStyle, flex: 1, maxWidth: 180 }}
                      >
                        {CARDIO_TYPES.map(t => (
                          <option key={t} value={t}>{CARDIO_LABELS[t] || t}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => deleteCardio(bloc.id)}
                        className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-xs"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          defaultValue={bloc.duree_minutes || ''}
                          onBlur={(e) => updateCardio(bloc.id, 'duree_minutes', e.target.value)}
                          style={{ ...editInputStyle, width: 55, padding: '6px 8px' }}
                        />
                        <span className="text-xs" style={{ color: '#777' }}>min</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          defaultValue={bloc.calories || ''}
                          onBlur={(e) => updateCardio(bloc.id, 'calories', e.target.value)}
                          placeholder="cal"
                          style={{ ...editInputStyle, width: 55, padding: '6px 8px' }}
                        />
                        <span className="text-xs" style={{ color: '#777' }}>kcal</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: '#777' }}>RPE</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          defaultValue={bloc.rpe || ''}
                          onBlur={(e) => updateCardio(bloc.id, 'rpe', e.target.value)}
                          style={{ ...editInputStyle, width: 45, padding: '6px 8px' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ SECTION EXERCICES ══ */}
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
                    border: isEditing
                      ? '1px dashed rgba(249,115,22,0.3)'
                      : groupHasPR
                        ? '1px solid rgba(34,197,94,0.25)'
                        : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {isEditing ? (
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold" style={{ color: changingExerciceFor?.oldExerciceId === group.exerciceId ? '#f97316' : '#f0f0f0' }}>
                        {group.nom}
                      </p>
                      <button
                        onClick={() => {
                          if (changingExerciceFor?.oldExerciceId === group.exerciceId) {
                            setChangingExerciceFor(null)
                            setGroupeFilter('tous')
                            setSearchText('')
                            setIsCreatingExo(false)
                          } else {
                            setChangingExerciceFor({ oldExerciceId: group.exerciceId, oldExerciceNom: group.nom })
                            setGroupeFilter('tous')
                            setSearchText('')
                            setIsCreatingExo(false)
                          }
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ color: '#f97316', background: 'rgba(249,115,22,0.1)' }}
                      >
                        🔄 Changer
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold mb-1.5" style={{ color: '#f0f0f0' }}>
                      {group.nom}
                    </p>
                  )}
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

                  {/* ── Sélecteur changement d'exercice (inline) ── */}
                  {isEditing && changingExerciceFor?.oldExerciceId === group.exerciceId && (
                    <div
                      className="rounded-[10px] p-3 mb-3"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}
                    >
                      <p className="text-xs font-medium mb-1" style={{ color: '#f97316' }}>
                        🔄 Changer l'exercice
                      </p>
                      <p className="text-[11px] mb-3" style={{ color: '#777' }}>
                        Actuellement : {changingExerciceFor.oldExerciceNom}
                      </p>

                      {!isCreatingExo ? (
                        <>
                          {/* Pills groupes musculaires */}
                          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {GROUPE_PILLS.map(g => (
                              <button
                                key={g.value}
                                onClick={() => setGroupeFilter(g.value)}
                                className="text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium"
                                style={{
                                  background: groupeFilter === g.value ? '#f97316' : 'rgba(255,255,255,0.06)',
                                  color: groupeFilter === g.value ? '#fff' : '#777',
                                  border: groupeFilter === g.value ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                  flexShrink: 0,
                                }}
                              >
                                {g.label}
                              </button>
                            ))}
                          </div>

                          {/* Recherche texte */}
                          <input
                            type="text"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="🔍 Rechercher..."
                            style={{
                              ...editInputStyle,
                              width: '100%',
                              marginBottom: 8,
                              fontSize: 16,
                            }}
                          />

                          {/* Liste des exercices */}
                          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                            {filteredCatalogue.length === 0 ? (
                              <p className="text-xs text-center py-4" style={{ color: '#555' }}>
                                Aucun exercice trouvé
                              </p>
                            ) : (
                              filteredCatalogue.map(ex => (
                                <button
                                  key={ex.id}
                                  onClick={() => handleChangeExercice(ex.id, ex)}
                                  className="w-full text-left px-3 py-3 flex items-center justify-between"
                                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                  <span className="text-xs font-medium" style={{ color: '#f0f0f0' }}>
                                    {ex.nom}
                                  </span>
                                  <span className="text-[10px]" style={{ color: '#555' }}>
                                    {ex.type || ex.categorie || ''}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>

                          {/* Bouton créer un exercice */}
                          <button
                            onClick={() => setIsCreatingExo(true)}
                            className="w-full mt-2 py-2.5 text-xs font-medium rounded-lg"
                            style={{ color: '#f97316', border: '1px dashed rgba(249,115,22,0.3)', background: 'transparent' }}
                          >
                            + Créer un exercice
                          </button>

                          {/* Bouton annuler */}
                          <button
                            onClick={() => {
                              setChangingExerciceFor(null)
                              setGroupeFilter('tous')
                              setSearchText('')
                            }}
                            className="w-full mt-2 py-2 text-xs font-medium rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        /* ── Formulaire création d'exercice ── */
                        <>
                          <div className="mb-2">
                            <label className="text-[11px] font-medium block mb-1" style={{ color: '#777' }}>Nom</label>
                            <input
                              type="text"
                              value={newExo.nom}
                              onChange={(e) => setNewExo(prev => ({ ...prev, nom: e.target.value }))}
                              placeholder="Nom de l'exercice"
                              style={{ ...editInputStyle, width: '100%', fontSize: 16 }}
                            />
                          </div>
                          <div className="mb-2">
                            <label className="text-[11px] font-medium block mb-1" style={{ color: '#777' }}>Catégorie</label>
                            <select
                              value={newExo.categorie}
                              onChange={(e) => setNewExo(prev => ({ ...prev, categorie: e.target.value }))}
                              style={{ ...editInputStyle, width: '100%' }}
                            >
                              {CATEGORIES_CREATE.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="mb-2">
                            <label className="text-[11px] font-medium block mb-1" style={{ color: '#777' }}>Groupe musculaire</label>
                            <select
                              value={newExo.groupe_musculaire}
                              onChange={(e) => setNewExo(prev => ({ ...prev, groupe_musculaire: e.target.value }))}
                              style={{ ...editInputStyle, width: '100%' }}
                            >
                              {GROUPES_CREATE.map(g => (
                                <option key={g.value} value={g.value}>{g.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="mb-3">
                            <label className="text-[11px] font-medium block mb-1" style={{ color: '#777' }}>Type</label>
                            <select
                              value={newExo.type}
                              onChange={(e) => setNewExo(prev => ({ ...prev, type: e.target.value }))}
                              style={{ ...editInputStyle, width: '100%' }}
                            >
                              {TYPES_CREATE.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateAndUse}
                              disabled={!newExo.nom.trim()}
                              className="flex-1 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
                            >
                              ✅ Créer et utiliser
                            </button>
                            <button
                              onClick={() => {
                                setIsCreatingExo(false)
                                setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' })
                              }}
                              className="flex-1 py-2.5 text-sm font-medium rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
                            >
                              Annuler
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Séries */}
                  <div className="mt-2">
                    {!isEditing && (
                      <div
                        className="flex items-center text-[10px] uppercase tracking-wider pb-1 mb-1"
                        style={{ color: '#555', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <span className="w-12">Série</span>
                        <span className="w-14">Reps</span>
                        <span className="flex-1">Poids</span>
                      </div>
                    )}

                    {group.series.map((serie) => {
                      const serieIsPR = isPR(serie)

                      if (isEditing) {
                        return (
                          <div key={serie.id} className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs w-6 text-center" style={{ color: '#555' }}>
                              {serie.num_serie}
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              defaultValue={serie.repetitions}
                              onBlur={(e) => updateSerie(serie.id, 'repetitions', e.target.value)}
                              style={{ ...editInputStyle, width: 50, padding: '6px 8px', textAlign: 'center' }}
                            />
                            <span className="text-xs" style={{ color: '#777' }}>reps</span>
                            <span className="text-xs" style={{ color: '#555' }}>×</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step={0.5}
                              defaultValue={serie.poids_kg != null ? toDisplay(serie.poids_kg, unite) : ''}
                              onBlur={(e) => updateSerie(serie.id, 'poids_kg', e.target.value)}
                              placeholder="PDC"
                              style={{ ...editInputStyle, width: 60, padding: '6px 8px', textAlign: 'center' }}
                            />
                            <span className="text-xs" style={{ color: '#777' }}>{unitLabel(unite)}</span>
                            <button
                              onClick={() => deleteSerie(serie.id)}
                              className="ml-auto w-7 h-7 rounded-full flex items-center justify-center text-xs"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                            >
                              ×
                            </button>
                          </div>
                        )
                      }

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
                              className="pr-badge text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                            >
                              🏆 PR
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {/* Bouton + Ajouter une série (mode édition) */}
                    {isEditing && (
                      <button
                        onClick={() => addSerie(group.exerciceId, group.ordre)}
                        className="mt-2 w-full py-2 text-xs font-medium rounded-lg"
                        style={{ color: '#f97316', border: '1px dashed rgba(249,115,22,0.3)', background: 'transparent' }}
                      >
                        + Ajouter une série
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ TEXTE BRUT (repliable) ══ */}
      {seance.texte_brut && !isEditing && (
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

      {/* ══ SECTION COACHING IA ══ */}
      {!isEditing && (seance.coaching_before || seance.coaching_during || seance.coaching_after) && (
        <div className="mb-6">
          <p
            className="text-xs font-medium uppercase tracking-wider mb-3 pb-1"
            style={{ color: '#a855f7', borderBottom: '1px solid rgba(168,85,247,0.2)' }}
          >
            🧠 Coaching IA
          </p>
          <div className="flex flex-col gap-2">
            {seance.coaching_before && (
              <div
                className="rounded-[10px] overflow-hidden"
                style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}
              >
                <button
                  onClick={() => setShowCoachBefore(!showCoachBefore)}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-medium flex items-center justify-between"
                  style={{ color: '#c084fc' }}
                >
                  <span>🌅 Avant séance</span>
                  <span>{showCoachBefore ? '▾' : '▸'}</span>
                </button>
                {showCoachBefore && (
                  <div className="px-3.5 pb-3 text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#c084fc' }}>
                    {seance.coaching_before}
                  </div>
                )}
              </div>
            )}
            {seance.coaching_during && (
              <div
                className="rounded-[10px] overflow-hidden"
                style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}
              >
                <button
                  onClick={() => setShowCoachDuring(!showCoachDuring)}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-medium flex items-center justify-between"
                  style={{ color: '#c084fc' }}
                >
                  <span>⚡ Pendant séance</span>
                  <span>{showCoachDuring ? '▾' : '▸'}</span>
                </button>
                {showCoachDuring && (
                  <div className="px-3.5 pb-3 text-xs leading-relaxed" style={{ color: '#c084fc' }}>
                    {seance.coaching_during.split('\n\n---\n\n').map((block, i, arr) => (
                      <div key={i}>
                        <p className="whitespace-pre-wrap">{block}</p>
                        {i < arr.length - 1 && (
                          <hr className="my-3" style={{ borderColor: 'rgba(168,85,247,0.2)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {seance.coaching_after && (
              <div
                className="rounded-[10px] overflow-hidden"
                style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}
              >
                <button
                  onClick={() => setShowCoachAfter(!showCoachAfter)}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-medium flex items-center justify-between"
                  style={{ color: '#c084fc' }}
                >
                  <span>📊 Après séance</span>
                  <span>{showCoachAfter ? '▾' : '▸'}</span>
                </button>
                {showCoachAfter && (
                  <div className="px-3.5 pb-3 text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#c084fc' }}>
                    {seance.coaching_after}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* ══ SECTION AJOUTER (mode édition) ══ */}
      {/* ═══════════════════════════════════════ */}
      {isEditing && (
        <div
          className="mb-6 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: '#f0f0f0' }}>
            + Ajouter à cette séance
          </p>

          {/* Onglets */}
          <div className="flex gap-2 mb-3">
            {[
              { key: 'nlp', label: '✍️ Texte libre' },
              { key: 'manual', label: '📋 Manuel' },
              { key: 'cardio', label: '🏃 Cardio' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setAddMode(addMode === tab.key ? null : tab.key)}
                className="flex-1 py-2.5 text-xs font-medium rounded-lg transition-colors"
                style={{
                  background: addMode === tab.key ? '#f97316' : 'rgba(255,255,255,0.06)',
                  color: addMode === tab.key ? '#fff' : '#999',
                  border: addMode === tab.key ? 'none' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Mode NLP ── */}
          {addMode === 'nlp' && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {!nlpResult ? (
                <>
                  <textarea
                    value={nlpText}
                    onChange={(e) => setNlpText(e.target.value)}
                    placeholder="Ex: pompes 3x20, curl 15kg 3x12..."
                    rows={3}
                    style={{ ...editInputStyle, width: '100%', resize: 'none', marginBottom: 8 }}
                  />
                  <button
                    onClick={handleNlpAnalyze}
                    disabled={nlpLoading || nlpText.trim().length < 5}
                    className="w-full py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
                  >
                    {nlpLoading ? '⏳ Analyse...' : '⚡ Analyser'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium mb-2" style={{ color: '#f0f0f0' }}>
                    Résultats de l'analyse :
                  </p>
                  {/* Cardio trouvé */}
                  {nlpResult.seance?.cardio?.map((c, i) => (
                    <div key={i} className="text-xs mb-1 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>
                      🏃 {c.type} · {c.duree} min {c.calories ? `· ${c.calories} kcal` : ''}
                    </div>
                  ))}
                  {/* Exercices trouvés */}
                  {nlpResult.seance?.exercices?.map((ex, i) => (
                    <div key={i} className="text-xs mb-1 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(249,115,22,0.1)', color: '#fb923c' }}>
                      🏋️ {ex.nom} · {ex.series?.length || 0} série(s)
                      {ex.series?.[0]?.poids_kg ? ` · ${ex.series[0].poids_kg} kg` : ''}
                    </div>
                  ))}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleNlpConfirm}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-lg"
                      style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}
                    >
                      ✅ Confirmer
                    </button>
                    <button
                      onClick={() => { setNlpResult(null); setNlpText('') }}
                      className="flex-1 py-2.5 text-sm font-medium rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
                    >
                      Annuler
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Mode Manuel ── */}
          {addMode === 'manual' && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <select
                value={manualExoId}
                onChange={(e) => setManualExoId(e.target.value)}
                style={{ ...editInputStyle, width: '100%', marginBottom: 8 }}
              >
                <option value="">Choisis un exercice...</option>
                {exercicesCatalogue.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.nom} {ex.groupe_musculaire ? `(${ex.groupe_musculaire})` : ''}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={manualNbSeries}
                    onChange={(e) => setManualNbSeries(parseInt(e.target.value) || 1)}
                    style={{ ...editInputStyle, width: 50, textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>séries</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={manualReps}
                    onChange={(e) => setManualReps(parseInt(e.target.value) || 1)}
                    style={{ ...editInputStyle, width: 50, textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>reps</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.5}
                    value={manualPoids}
                    onChange={(e) => setManualPoids(e.target.value)}
                    placeholder="PDC"
                    style={{ ...editInputStyle, width: 60, textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>{unitLabel(unite)}</span>
                </div>
              </div>

              <button
                onClick={addManualExercice}
                disabled={!manualExoId}
                className="w-full py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}
              >
                ✅ Ajouter
              </button>
            </div>
          )}

          {/* ── Mode Cardio ── */}
          {addMode === 'cardio' && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <select
                value={newCardioType}
                onChange={(e) => setNewCardioType(e.target.value)}
                style={{ ...editInputStyle, width: '100%', marginBottom: 8 }}
              >
                {CARDIO_TYPES.map(t => (
                  <option key={t} value={t}>{CARDIO_LABELS[t] || t}</option>
                ))}
              </select>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newCardioDuree}
                    onChange={(e) => setNewCardioDuree(e.target.value)}
                    placeholder="20"
                    style={{ ...editInputStyle, width: 55, textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>min</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newCardioCalories}
                    onChange={(e) => setNewCardioCalories(e.target.value)}
                    placeholder="cal"
                    style={{ ...editInputStyle, width: 55, textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span className="text-xs" style={{ color: '#777' }}>kcal</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: '#777' }}>RPE</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10}
                    value={newCardioRpe}
                    onChange={(e) => setNewCardioRpe(e.target.value)}
                    style={{ ...editInputStyle, width: 45, textAlign: 'center', padding: '6px 8px' }}
                  />
                </div>
              </div>

              <button
                onClick={addCardioBloc}
                disabled={!newCardioDuree}
                className="w-full py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}
              >
                ✅ Ajouter
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ BOUTONS BAS DE PAGE (mode lecture) ══ */}
      {!isEditing && (
        <>
          {groups.length > 0 && (
            <button
              onClick={handleOpenTemplateModal}
              className="w-full py-3 mb-3 text-sm font-semibold rounded-xl transition-colors"
              style={{ background: 'transparent', color: '#999', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              📋 Sauver comme template
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full py-3 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {deleting ? 'Suppression...' : '🗑️ Supprimer cette séance'}
          </button>
        </>
      )}

      {/* ══ MODALE SAUVER COMME TEMPLATE ══ */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTemplateModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl px-4 pt-5 pb-6"
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {templateSuccess ? (
              <div className="text-center py-4">
                <p className="text-lg mb-2">✅</p>
                <p className="text-sm font-semibold mb-3" style={{ color: '#f0f0f0' }}>Template créé !</p>
                <a href="/templates" className="text-xs underline" style={{ color: '#f97316' }}>Voir mes templates →</a>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="w-full mt-4 py-2.5 text-sm rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-4" style={{ color: '#f0f0f0' }}>📋 Sauver comme template</h2>

                <label className="text-xs font-medium mb-1 block" style={{ color: '#777' }}>Nom</label>
                <input
                  type="text"
                  value={templateNom}
                  onChange={(e) => setTemplateNom(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 rounded-lg mb-3 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
                />

                <label className="text-xs font-medium mb-1 block" style={{ color: '#777' }}>Contexte</label>
                <div className="flex gap-2 mb-4">
                  {[
                    { value: 'maison', label: '🏠 Maison' },
                    { value: 'salle', label: '🏋️ Salle' },
                    { value: 'mixte', label: '🔀 Mixte' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTemplateContexte(opt.value)}
                      className="flex-1 py-2 text-xs font-medium rounded-lg transition-colors"
                      style={{
                        background: templateContexte === opt.value ? '#f97316' : 'rgba(255,255,255,0.07)',
                        color: templateContexte === opt.value ? '#fff' : '#777',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs mb-2" style={{ color: '#555' }}>
                  Exercices inclus ({[...new Set((seance.series || []).map((s) => s.exercice_id))].length}) :
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {groups.map((g, i) => (
                    <span key={i} className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#999' }}>
                      {g.nom}
                    </span>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveAsTemplate}
                    disabled={savingTemplate || !templateNom.trim()}
                    className="flex-1 py-3 text-sm font-semibold rounded-lg disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
                  >
                    {savingTemplate ? 'Création...' : '✅ Créer le template'}
                  </button>
                  <button
                    onClick={() => setShowTemplateModal(false)}
                    className="flex-1 py-3 text-sm font-semibold rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
