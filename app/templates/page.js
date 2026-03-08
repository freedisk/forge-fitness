'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Groupes musculaires pour le filtre exercices (même convention que /exercices)
const GROUPES = [
  'Tous', 'Pecs', 'Dos', 'Épaules', 'Biceps', 'Triceps',
  'Jambes', 'Abdos', 'Full body', 'Cardio',
]

// Supprime les accents/diacritiques — convention DB sans accents
function removeAccents(str) {
  if (!str) return str
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalise une valeur pour comparaison DB : minuscules, sans accents, underscores
function normalizeDbValue(str) {
  if (!str) return str
  return removeAccents(str).toLowerCase().replace(/\s+/g, '_').trim()
}

// Couleurs badge contexte
const CONTEXTE_COLORS = {
  maison: { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd', border: 'rgba(59,130,246,0.25)' },
  salle: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  mixte: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
}

// Badge réutilisable
function Badge({ label, bg, text, border }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: bg, color: text, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════
// Page Templates — CRUD complet : liste, création, édition, suppression
// ══════════════════════════════════════════════════════════════
export default function TemplatesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [catalogue, setCatalogue] = useState([])

  // Modale création / édition
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null) // null = création, objet = édition
  const [formNom, setFormNom] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formContexte, setFormContexte] = useState('salle')
  const [formExercices, setFormExercices] = useState([]) // [{id, nom, groupe_musculaire, categorie}]
  const [showCatalogue, setShowCatalogue] = useState(false)
  const [filtreGroupe, setFiltreGroupe] = useState('Tous')
  const [saving, setSaving] = useState(false)

  // Suppression
  const [deletingId, setDeletingId] = useState(null)

  // ── Chargement initial : auth + templates + catalogue ──
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)

      // Charger les templates avec exercices joints
      const { data: tpls } = await supabase
        .from('templates')
        .select('*, template_exercices(exercice_id, ordre, exercices(nom, categorie, groupe_musculaire))')
        .eq('user_id', session.user.id)
        .order('nom')

      setTemplates(tpls || [])

      // Charger le catalogue exercices (global + user)
      const { data: exos } = await supabase
        .from('exercices')
        .select('id, nom, categorie, groupe_musculaire')
        .or('user_id.is.null,user_id.eq.' + session.user.id)
        .order('groupe_musculaire,nom')

      setCatalogue(exos || [])
      setLoading(false)
    }
    load()
  }, [router])

  // ── Catalogue filtré par groupe musculaire ──
  const filteredCatalogue = useMemo(() => {
    if (filtreGroupe === 'Tous') return catalogue
    if (filtreGroupe === 'Cardio') return catalogue.filter((ex) => ex.categorie === 'cardio')
    return catalogue.filter(
      (ex) => normalizeDbValue(ex.groupe_musculaire) === normalizeDbValue(filtreGroupe)
    )
  }, [catalogue, filtreGroupe])

  // ── Recharger les templates après modification ──
  async function reloadTemplates() {
    const { data } = await supabase
      .from('templates')
      .select('*, template_exercices(exercice_id, ordre, exercices(nom, categorie, groupe_musculaire))')
      .eq('user_id', userId)
      .order('nom')
    setTemplates(data || [])
  }

  // ── Ouvrir la modale en mode création ──
  function handleNew() {
    setEditingTemplate(null)
    setFormNom('')
    setFormDescription('')
    setFormContexte('salle')
    setFormExercices([])
    setShowCatalogue(false)
    setFiltreGroupe('Tous')
    setShowModal(true)
  }

  // ── Ouvrir la modale en mode édition ──
  function handleEdit(tpl) {
    setEditingTemplate(tpl)
    setFormNom(tpl.nom)
    setFormDescription(tpl.description || '')
    setFormContexte(tpl.contexte || 'salle')
    // Reconstituer la liste ordonnée des exercices
    const exos = (tpl.template_exercices || [])
      .sort((a, b) => a.ordre - b.ordre)
      .map((te) => ({
        id: te.exercice_id,
        nom: te.exercices?.nom || 'Exercice',
        groupe_musculaire: te.exercices?.groupe_musculaire || '',
        categorie: te.exercices?.categorie || '',
      }))
    setFormExercices(exos)
    setShowCatalogue(false)
    setFiltreGroupe('Tous')
    setShowModal(true)
  }

  // ── Ajouter un exercice du catalogue ──
  function handleAddExercice(ex) {
    // Éviter les doublons
    if (formExercices.some((e) => e.id === ex.id)) return
    setFormExercices((prev) => [...prev, {
      id: ex.id,
      nom: ex.nom,
      groupe_musculaire: ex.groupe_musculaire || '',
      categorie: ex.categorie || '',
    }])
    setShowCatalogue(false)
  }

  // ── Retirer un exercice de la liste ──
  function handleRemoveExercice(exId) {
    setFormExercices((prev) => prev.filter((e) => e.id !== exId))
  }

  // ── Réordonner : monter un exercice ──
  function handleMoveUp(index) {
    if (index === 0) return
    setFormExercices((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  // ── Réordonner : descendre un exercice ──
  function handleMoveDown(index) {
    setFormExercices((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  // ── Sauvegarder (création ou édition) ──
  async function handleSave() {
    if (!formNom.trim() || !userId) return
    setSaving(true)

    try {
      if (editingTemplate) {
        // ── MODE ÉDITION ──
        // Mettre à jour le template
        await supabase
          .from('templates')
          .update({
            nom: formNom.trim(),
            description: formDescription.trim() || null,
            contexte: formContexte,
          })
          .eq('id', editingTemplate.id)

        // Supprimer les anciens exercices et réinsérer
        await supabase
          .from('template_exercices')
          .delete()
          .eq('template_id', editingTemplate.id)

        if (formExercices.length > 0) {
          const rows = formExercices.map((ex, i) => ({
            template_id: editingTemplate.id,
            exercice_id: ex.id,
            ordre: i,
          }))
          await supabase.from('template_exercices').insert(rows)
        }
      } else {
        // ── MODE CRÉATION ──
        const { data: newTpl, error: insertErr } = await supabase
          .from('templates')
          .insert({
            nom: formNom.trim(),
            description: formDescription.trim() || null,
            contexte: formContexte,
            source: 'manuel',
            user_id: userId,
          })
          .select()
          .single()

        if (insertErr) throw new Error(insertErr.message)

        // Ajouter les exercices
        if (formExercices.length > 0) {
          const rows = formExercices.map((ex, i) => ({
            template_id: newTpl.id,
            exercice_id: ex.id,
            ordre: i,
          }))
          await supabase.from('template_exercices').insert(rows)
        }
      }

      await reloadTemplates()
      setShowModal(false)
    } catch (err) {
      console.error('❌ Erreur sauvegarde template :', err)
    }
    setSaving(false)
  }

  // ── Supprimer un template ──
  async function handleDelete(tplId) {
    if (!confirm('Supprimer ce template ?')) return
    setDeletingId(tplId)

    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', tplId)

    if (error) {
      console.error('❌ Erreur suppression template :', error.message)
    } else {
      await reloadTemplates()
    }
    setDeletingId(null)
  }

  // ── Utiliser un template → rediriger vers /seance avec le template_id ──
  function handleUse(tpl) {
    // On passe le template_id en query param pour que /seance le récupère
    router.push(`/seance?template=${tpl.id}`)
  }

  // ── États : chargement ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>
          📋 Mes Templates
          <span className="text-base font-normal ml-2" style={{ color: '#777' }}>
            ({templates.length})
          </span>
        </h1>
        <button
          onClick={handleNew}
          className="px-3.5 py-2 text-sm font-semibold rounded-lg"
          style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
        >
          + Nouveau
        </button>
      </div>

      {/* Liste des templates */}
      {templates.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-lg mb-2" style={{ color: '#555' }}>📋</p>
          <p className="text-sm" style={{ color: '#777' }}>
            Aucun template. Crée ton premier !
          </p>
          <button
            onClick={handleNew}
            className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)' }}
          >
            + Créer un template
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((tpl) => {
            const ctxColors = CONTEXTE_COLORS[tpl.contexte] || CONTEXTE_COLORS.salle
            const exCount = tpl.template_exercices?.length || 0
            const exNames = (tpl.template_exercices || [])
              .sort((a, b) => a.ordre - b.ordre)
              .map((te) => te.exercices?.nom)
              .filter(Boolean)
              .join(', ')

            return (
              <div
                key={tpl.id}
                className="rounded-xl px-4 py-3.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* Ligne titre + badges */}
                <div className="flex items-start justify-between mb-1.5">
                  <p className="text-sm font-semibold truncate" style={{ color: '#f0f0f0' }}>
                    {tpl.nom}
                  </p>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    <Badge
                      label={tpl.contexte === 'maison' ? '🏠 Maison' : tpl.contexte === 'mixte' ? '🔀 Mixte' : '🏋️ Salle'}
                      bg={ctxColors.bg}
                      text={ctxColors.text}
                      border={ctxColors.border}
                    />
                    {tpl.source === 'ia_genere' && (
                      <Badge label="🧠 IA" bg="rgba(168,85,247,0.15)" text="#c084fc" border="rgba(168,85,247,0.25)" />
                    )}
                  </div>
                </div>

                {/* Description tronquée */}
                {tpl.description && (
                  <p className="text-xs mb-1.5 line-clamp-2" style={{ color: '#777' }}>
                    {tpl.description}
                  </p>
                )}

                {/* Liste exercices compacte */}
                <p className="text-xs mb-3 truncate" style={{ color: '#999' }}>
                  {exCount} exercice{exCount > 1 ? 's' : ''}{exNames ? ` : ${exNames}` : ''}
                </p>

                {/* Boutons action */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUse(tpl)}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg"
                    style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
                  >
                    ⚡ Utiliser
                  </button>
                  <button
                    onClick={() => handleEdit(tpl)}
                    className="px-3 py-2 text-xs font-medium rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#999' }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id)}
                    disabled={deletingId === tpl.id}
                    className="px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                  >
                    {deletingId === tpl.id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODALE CRÉATION / ÉDITION */}
      {/* ══════════════════════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl px-4 pt-5 pb-6 max-h-[90vh] overflow-y-auto"
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <h2 className="text-lg font-bold mb-4" style={{ color: '#f0f0f0' }}>
              {editingTemplate ? '✏️ Modifier le template' : '📋 Nouveau template'}
            </h2>

            {/* Champ Nom */}
            <label className="text-xs font-medium mb-1 block" style={{ color: '#777' }}>Nom *</label>
            <input
              type="text"
              value={formNom}
              onChange={(e) => setFormNom(e.target.value)}
              placeholder="Ex: Full Body Salle"
              className="w-full text-sm px-3 py-2.5 rounded-lg mb-3 outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
            />

            {/* Champ Description */}
            <label className="text-xs font-medium mb-1 block" style={{ color: '#777' }}>Description</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Ex: Séance complète pour la salle"
              className="w-full text-sm px-3 py-2.5 rounded-lg mb-3 outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
            />

            {/* Sélecteur Contexte */}
            <label className="text-xs font-medium mb-1 block" style={{ color: '#777' }}>Contexte</label>
            <div className="flex gap-2 mb-4">
              {[
                { value: 'maison', label: '🏠 Maison' },
                { value: 'salle', label: '🏋️ Salle' },
                { value: 'mixte', label: '🔀 Mixte' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormContexte(opt.value)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg transition-colors"
                  style={{
                    background: formContexte === opt.value ? '#f97316' : 'rgba(255,255,255,0.07)',
                    color: formContexte === opt.value ? '#fff' : '#777',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* ── EXERCICES DU TEMPLATE ── */}
            <label className="text-xs font-medium mb-2 block" style={{ color: '#777' }}>
              Exercices ({formExercices.length})
            </label>

            {/* Liste ordonnée */}
            {formExercices.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-3">
                {formExercices.map((ex, i) => (
                  <div
                    key={ex.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Numéro d'ordre */}
                    <span className="text-xs font-mono w-5 text-center" style={{ color: '#555' }}>{i + 1}</span>

                    {/* Nom exercice */}
                    <span className="text-sm flex-1 truncate" style={{ color: '#f0f0f0' }}>{ex.nom}</span>

                    {/* Boutons réordonner */}
                    <button
                      onClick={() => handleMoveUp(i)}
                      disabled={i === 0}
                      className="text-xs px-1 disabled:opacity-20"
                      style={{ color: '#777' }}
                    >↑</button>
                    <button
                      onClick={() => handleMoveDown(i)}
                      disabled={i === formExercices.length - 1}
                      className="text-xs px-1 disabled:opacity-20"
                      style={{ color: '#777' }}
                    >↓</button>

                    {/* Bouton retirer */}
                    <button
                      onClick={() => handleRemoveExercice(ex.id)}
                      className="text-xs px-1"
                      style={{ color: '#ef4444' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Bouton ajouter un exercice */}
            {!showCatalogue ? (
              <button
                onClick={() => setShowCatalogue(true)}
                className="w-full py-2.5 text-xs font-semibold rounded-lg mb-4"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#999', border: '1px dashed rgba(255,255,255,0.15)' }}
              >
                + Ajouter un exercice
              </button>
            ) : (
              <div
                className="rounded-lg px-3 py-3 mb-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Pills groupes musculaires */}
                <div
                  className="flex gap-1.5 overflow-x-auto pb-2 mb-2"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {GROUPES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setFiltreGroupe(g)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors"
                      style={{
                        background: filtreGroupe === g ? '#f97316' : 'rgba(255,255,255,0.07)',
                        color: filtreGroupe === g ? '#fff' : '#777',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                {/* Liste exercices filtrés */}
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {filteredCatalogue.map((ex) => {
                    const alreadyAdded = formExercices.some((e) => e.id === ex.id)
                    return (
                      <button
                        key={ex.id}
                        onClick={() => !alreadyAdded && handleAddExercice(ex)}
                        disabled={alreadyAdded}
                        className="text-left px-2.5 py-2 rounded-lg text-xs transition-colors disabled:opacity-30"
                        style={{ background: alreadyAdded ? 'rgba(34,197,94,0.08)' : 'transparent', color: '#f0f0f0' }}
                      >
                        {alreadyAdded ? '✅ ' : ''}{ex.nom}
                        {ex.groupe_musculaire && (
                          <span className="ml-2" style={{ color: '#555' }}>{ex.groupe_musculaire}</span>
                        )}
                      </button>
                    )
                  })}
                  {filteredCatalogue.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: '#555' }}>Aucun exercice trouvé</p>
                  )}
                </div>

                {/* Fermer le catalogue */}
                <button
                  onClick={() => setShowCatalogue(false)}
                  className="w-full mt-2 py-1.5 text-xs rounded-lg"
                  style={{ color: '#777' }}
                >
                  Fermer le catalogue
                </button>
              </div>
            )}

            {/* ── Boutons : Enregistrer / Annuler ── */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formNom.trim()}
                className="flex-1 py-3 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', color: '#fff' }}
              >
                {saving ? 'Enregistrement...' : '✅ Enregistrer'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 text-sm font-semibold rounded-lg"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#777' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
