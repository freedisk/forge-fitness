// ═══════════════════════════════════════════════════════
// Auto-learning : chercher ou créer un exercice en DB
// Utilisé par /seance et /historique/[id] (mode édition)
// ═══════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase'

// Retirer les accents pour comparaison
export function removeAccents(str) {
  if (!str) return str
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normaliser pour stockage DB (catégorie, groupe_musculaire)
export function normalizeDbValue(str) {
  if (!str) return str
  return removeAccents(str)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim()
}

// Normaliser le nom pour comparaison anti-doublon
export function normalizeExerciceName(nom) {
  return nom
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Format canonique pour stockage (première lettre majuscule)
export function canonicalizeExerciceName(nom) {
  const normalized = normalizeExerciceName(nom)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

// ── Résoudre un exercice : chercher en DB, ou créer si pas trouvé ──
// Retourne l'exercice_id (UUID) ou null en cas d'erreur
export async function resolveExerciceId(ex, userId) {
  const normalizedInput = normalizeExerciceName(ex.nom)

  // 1. Charger tous les exercices accessibles (catalogue + user)
  const { data: allExercices } = await supabase
    .from('exercices')
    .select('id, nom')
    .or(`user_id.is.null,user_id.eq.${userId}`)

  // 2. Chercher une correspondance normalisée
  if (allExercices && allExercices.length > 0) {
    const match = allExercices.find(
      (e) => normalizeExerciceName(e.nom) === normalizedInput
    )
    if (match) {
      console.log(`📖 Exercice trouvé (normalisé) : "${ex.nom}" → "${match.nom}" id=${match.id}`)
      return match.id
    }
  }

  // 3. Pas trouvé → créer avec source='ia_infere'
  const canonicalName = canonicalizeExerciceName(ex.nom)
  const { data: created, error } = await supabase
    .from('exercices')
    .insert({
      nom: canonicalName,
      categorie: normalizeDbValue(ex.categorie),
      groupe_musculaire: normalizeDbValue(ex.groupe_musculaire),
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
