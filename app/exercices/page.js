'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Supprime les accents/diacritiques — convention DB sans accents
function removeAccents(str) {
  if (!str) return str
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalise une valeur pour format DB technique : minuscules, sans accents, underscores
function normalizeDbValue(str) {
  if (!str) return str
  return removeAccents(str)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim()
}

// Groupes musculaires pour les pills de filtre
const GROUPES = [
  'Tous', 'Pecs', 'Dos', 'Épaules', 'Biceps', 'Triceps',
  'Jambes', 'Abdos', 'Full body', 'Cardio',
]

// Options pour les selects d'édition/création — values = identifiants DB
const CATEGORIES = [
  { value: 'musculation', label: 'Musculation' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobilite', label: 'Mobilité' },
  { value: 'autres', label: 'Autres' },
]

const GROUPES_SELECT = [
  { value: 'pecs', label: 'Pecs' },
  { value: 'dos', label: 'Dos' },
  { value: 'epaules', label: 'Épaules' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'jambes', label: 'Jambes' },
  { value: 'abdos', label: 'Abdos' },
  { value: 'full_body', label: 'Full body' },
]

const TYPES = [
  { value: 'barre', label: 'Barre' },
  { value: 'halteres', label: 'Haltères' },
  { value: 'machine', label: 'Machine' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
]

// Style commun pour les selects d'édition
const selectStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  color: '#f0f0f0',
  fontSize: 14,
  padding: '6px 8px',
  minHeight: 36,
  width: '100%',
}

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
  const [userId, setUserId] = useState(null)

  // Édition inline d'un exercice perso
  const [editingExercice, setEditingExercice] = useState(null)

  // Création d'exercice
  const [isCreating, setIsCreating] = useState(false)
  const [newExo, setNewExo] = useState({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' })

  // Toast notifications
  const [toast, setToast] = useState(null)

  useEffect(() => {
    async function load() {
      // Vérifier l'auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUserId(session.user.id)

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

  // ── Toast helper ──
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Sauvegarder un exercice édité ──
  async function handleSaveExercice() {
    if (!editingExercice || !editingExercice.nom.trim()) return

    const normalizedCategorie = normalizeDbValue(editingExercice.categorie)
    const normalizedGroupe = normalizeDbValue(editingExercice.groupe_musculaire)

    const { error: updateErr } = await supabase
      .from('exercices')
      .update({
        nom: editingExercice.nom.trim(),
        categorie: normalizedCategorie,
        groupe_musculaire: normalizedGroupe,
        type: editingExercice.type,
      })
      .eq('id', editingExercice.id)

    if (!updateErr) {
      setExercices(prev => prev.map(ex =>
        ex.id === editingExercice.id
          ? { ...ex, nom: editingExercice.nom.trim(), categorie: normalizedCategorie, groupe_musculaire: normalizedGroupe, type: editingExercice.type }
          : ex
      ))
      setEditingExercice(null)
      showToast('Exercice modifié ✅')
    } else {
      console.error('Erreur update exercice:', updateErr)
      showToast('Erreur lors de la modification', 'error')
    }
  }

  // ── Supprimer un exercice perso ──
  async function handleDeleteExercice(exercice) {
    // Vérifier si l'exercice est utilisé dans des séries
    const { count } = await supabase
      .from('series')
      .select('id', { count: 'exact', head: true })
      .eq('exercice_id', exercice.id)

    let confirmMessage
    if (count > 0) {
      confirmMessage = `Supprimer "${exercice.nom}" ?\n\n⚠️ Cet exercice est utilisé dans ${count} série(s). Les séries associées seront également supprimées (données perdues).\n\nCette action est irréversible.`
    } else {
      confirmMessage = `Supprimer "${exercice.nom}" ?\n\nCet exercice n'est utilisé dans aucune séance.`
    }

    if (!confirm(confirmMessage)) return

    const { error: delErr } = await supabase
      .from('exercices')
      .delete()
      .eq('id', exercice.id)

    if (!delErr) {
      setExercices(prev => prev.filter(ex => ex.id !== exercice.id))
      showToast('Exercice supprimé')
    } else {
      console.error('Erreur suppression exercice:', delErr)
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  // ── Créer un exercice ──
  async function handleCreateExercice() {
    if (!newExo.nom.trim()) return

    const normalizedCategorie = normalizeDbValue(newExo.categorie)
    const normalizedGroupe = normalizeDbValue(newExo.groupe_musculaire)

    const { data: created, error: createErr } = await supabase
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
      setExercices(prev => [...prev, created].sort((a, b) => a.nom.localeCompare(b.nom)))
      setIsCreating(false)
      setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' })
      showToast('Exercice créé ✅')
    } else {
      console.error('Erreur création exercice:', createErr)
      showToast('Erreur lors de la création', 'error')
    }
  }

  // Filtre côté client — pas de nouvelle requête DB
  const filtered = useMemo(() => {
    if (filtre === 'Tous') return exercices
    if (filtre === 'Cardio') return exercices.filter((ex) => ex.categorie === 'cardio')
    return exercices.filter((ex) =>
      normalizeDbValue(ex.groupe_musculaire) === normalizeDbValue(filtre)
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

      {/* Compteur + bouton créer */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: '#777' }}>
          {filtered.length} exercice{filtered.length > 1 ? 's' : ''}
        </p>
        <button
          onClick={() => { setIsCreating(true); setEditingExercice(null) }}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
        >
          + Créer un exercice
        </button>
      </div>

      {/* Formulaire création inline */}
      {isCreating && (
        <div
          className="rounded-[10px] px-3.5 py-3.5 mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(249,115,22,0.4)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: '#f97316' }}>Nouvel exercice</p>
          <input
            type="text"
            value={newExo.nom}
            onChange={e => setNewExo(prev => ({ ...prev, nom: e.target.value }))}
            placeholder="Nom de l'exercice"
            className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: 16 }}
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select value={newExo.categorie} onChange={e => setNewExo(prev => ({ ...prev, categorie: e.target.value }))} style={selectStyle}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={newExo.groupe_musculaire} onChange={e => setNewExo(prev => ({ ...prev, groupe_musculaire: e.target.value }))} style={selectStyle}>
              {GROUPES_SELECT.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={newExo.type} onChange={e => setNewExo(prev => ({ ...prev, type: e.target.value }))} style={selectStyle}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateExercice}
              disabled={!newExo.nom.trim()}
              className="text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-40"
              style={{ background: '#f97316', color: '#fff' }}
            >
              ✅ Créer
            </button>
            <button
              onClick={() => { setIsCreating(false); setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' }) }}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ color: '#777' }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste des exercices */}
      {filtered.length === 0 ? (
        <p className="text-sm text-center mt-12" style={{ color: '#777' }}>
          Aucun exercice dans cette catégorie
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((ex) => {
            const isCustom = ex.is_custom && ex.user_id === userId
            const isEditingThis = editingExercice?.id === ex.id

            // ── Mode édition inline ──
            if (isEditingThis) {
              return (
                <div
                  key={ex.id}
                  className="rounded-[10px] px-3.5 py-3.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(249,115,22,0.5)' }}
                >
                  <input
                    type="text"
                    value={editingExercice.nom}
                    onChange={e => setEditingExercice(prev => ({ ...prev, nom: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-2"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)', fontSize: 16 }}
                  />
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <select
                      value={CATEGORIES.find(c => c.value === editingExercice.categorie) ? editingExercice.categorie : 'autres'}
                      onChange={e => setEditingExercice(prev => ({ ...prev, categorie: e.target.value }))}
                      style={selectStyle}
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <select
                      value={GROUPES_SELECT.find(g => g.value === editingExercice.groupe_musculaire) ? editingExercice.groupe_musculaire : 'full_body'}
                      onChange={e => setEditingExercice(prev => ({ ...prev, groupe_musculaire: e.target.value }))}
                      style={selectStyle}
                    >
                      {GROUPES_SELECT.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                    <select
                      value={TYPES.find(t => t.value === editingExercice.type) ? editingExercice.type : 'barre'}
                      onChange={e => setEditingExercice(prev => ({ ...prev, type: e.target.value }))}
                      style={selectStyle}
                    >
                      {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveExercice}
                      disabled={!editingExercice.nom.trim()}
                      className="text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-40"
                      style={{ background: '#f97316', color: '#fff' }}
                    >
                      ✅ Enregistrer
                    </button>
                    <button
                      onClick={() => setEditingExercice(null)}
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ color: '#777' }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )
            }

            // ── Mode lecture ──
            return (
              <div
                key={ex.id}
                className="flex items-center justify-between rounded-[10px] px-3.5 py-3.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                      {ex.nom}
                    </p>
                    <SourceBadge source={ex.source} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#777' }}>
                    {ex.categorie && <span>{ex.categorie}</span>}
                    {ex.categorie && ex.groupe_musculaire && <span> · </span>}
                    {ex.groupe_musculaire && <span>{ex.groupe_musculaire}</span>}
                  </p>
                </div>

                {/* Boutons action — exercices perso uniquement */}
                {isCustom && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={() => { setEditingExercice({ id: ex.id, nom: ex.nom, categorie: ex.categorie || 'autres', groupe_musculaire: ex.groupe_musculaire || 'full_body', type: ex.type || 'barre' }); setIsCreating(false) }}
                      className="flex items-center justify-center"
                      style={{ width: 44, height: 44, color: '#777', fontSize: 18 }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteExercice(ex)}
                      className="flex items-center justify-center"
                      style={{ width: 44, height: 44, color: '#777', fontSize: 18 }}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium z-50"
          style={{
            background: toast.type === 'error' ? '#ef4444' : '#22c55e',
            color: '#fff',
            animation: 'toastIn 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
