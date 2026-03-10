// API Route coaching — 3 modes via Claude Sonnet
// before : propose un plan · during : suggère la suite · after : analyse la séance
// Inclut retry automatique (1 retry, 1.5s) + fallback messages gracieux

import { NextResponse } from 'next/server'

const MODES = ['before', 'during', 'after']

// Messages de repli si l'IA est injoignable
const FALLBACK_MESSAGES = {
  before: "Je n'ai pas pu générer de plan pour le moment. Lance ta séance comme tu le sens, tu peux me redemander pendant ! 💪",
  during: "Désolé, je ne peux pas analyser ta séance en ce moment. Continue à ton rythme !",
  after: "L'analyse n'est pas disponible pour le moment. Ta séance a bien été enregistrée. 🔥",
}

// ── Prompt système dynamique selon le profil ──
function buildSystemPrompt(profil) {
  const age = profil?.age || '?'
  const poids = profil?.poids_kg ? `${profil.poids_kg} kg` : '?'
  const taille = profil?.taille_cm ? `${profil.taille_cm} cm` : '?'
  const niveau = profil?.niveau || 'intermediaire'
  const objectif = profil?.objectif || 'equilibre'
  const contextes = profil?.contextes_dispo?.join(', ') || 'maison, salle'
  const unite = profil?.unite_poids || 'kg'

  return `Tu es un coach fitness personnel bienveillant et compétent. Tu t'adresses à un homme de ${age} ans, ${poids}, ${taille}, niveau ${niveau}, objectif ${objectif}. Il s'entraîne à ${contextes}. Il préfère les unités en ${unite}.

Tu analyses son historique d'entraînement pour donner des conseils personnalisés, progressifs et motivants.

Règles :
1. Toujours répondre en FRANÇAIS.
2. Être concis — pas de blabla, aller droit aux conseils pratiques.
3. Si tu suggères des poids, utiliser l'unité préférée de l'utilisateur (${unite}).
4. Encourager la progression sans pousser au surentraînement.
5. Varier les groupes musculaires pour l'équilibre.
6. Adapter au contexte (maison vs salle) — ne pas suggérer des machines si l'utilisateur est à la maison.`
}

// ── Résumer l'historique pour réduire la taille du payload ──
function summarizeHistorique(historique) {
  return (historique || []).map((seance) => {
    // Résumé cardio compact
    const cardioSummary = (seance.cardio_blocs || [])
      .map((b) => {
        let s = b.type_cardio
        if (b.duree_minutes) s += ` ${b.duree_minutes}min`
        if (b.rpe) s += ` RPE ${b.rpe}`
        if (b.calories) s += ` ${b.calories}kcal`
        return s
      })
      .join(', ')

    // Résumé exercices compact : regrouper séries par exercice
    const exGroups = {}
    for (const s of (seance.series || [])) {
      const nom = s.exercices?.nom || 'Inconnu'
      if (!exGroups[nom]) exGroups[nom] = []
      exGroups[nom].push(s)
    }

    const exercicesSummary = Object.entries(exGroups).map(([nom, series]) => {
      const reps = series.map((s) => s.repetitions).join('-')
      const allSame = series.every((s) => s.repetitions === series[0].repetitions)
      const repsStr = allSame ? `${series.length}×${series[0].repetitions}` : reps
      const poids = series.find((s) => s.poids_kg != null)?.poids_kg
      return poids != null ? `${nom} ${repsStr} ${poids}kg` : `${nom} ${repsStr}`
    })

    return {
      date: seance.date,
      contexte: seance.contexte,
      duree: seance.duree_totale ? `${seance.duree_totale}min` : null,
      cardio: cardioSummary || null,
      exercices: exercicesSummary,
    }
  })
}

// ── Prompt utilisateur selon le mode ──
function buildUserPrompt(mode, profil, historique, seanceEnCours, contexte) {
  const historiqueResume = JSON.stringify(summarizeHistorique(historique), null, 2)
  const profilStr = JSON.stringify(profil || {}, null, 2)
  const N = (historique || []).length

  if (mode === 'before') {
    return `Mode : AVANT SÉANCE — Propose un plan d'entraînement.

Voici mes ${N} dernières séances :
${historiqueResume}

Profil : ${profilStr}

Contexte aujourd'hui : ${contexte || 'maison'}

Propose-moi un plan de séance adapté. Réponds en JSON avec cette structure :
{
  "message": "Un court paragraphe de coaching motivant et personnalisé (2-3 phrases max). Mentionne pourquoi tu suggères ces groupes musculaires aujourd'hui (ex: repos depuis X jours, progression sur tel exercice, équilibre).",
  "plan": [
    {
      "type": "cardio",
      "nom": "Vélo",
      "duree_minutes": 15,
      "rpe_cible": 6
    },
    {
      "type": "exercice",
      "nom": "Tractions",
      "series_suggerees": 3,
      "reps_suggerees": 9,
      "poids_suggere": null,
      "poids_unite": "${profil?.unite_poids || 'kg'}",
      "raison": "Tu as fait 3×8 la dernière fois, +1 rep pour progresser"
    }
  ]
}
Retourne UNIQUEMENT le JSON, rien d'autre.`
  }

  if (mode === 'during') {
    const seanceStr = JSON.stringify(seanceEnCours || {}, null, 2)
    return `Mode : PENDANT SÉANCE — Suggère la suite.

Voici ce que j'ai déjà fait dans cette séance :
${seanceStr}

Voici mes ${N} dernières séances (hors séance en cours) :
${historiqueResume}

Profil : ${profilStr}

Qu'est-ce que je devrais faire ensuite ? Réponds en JSON avec cette structure :
{
  "message": "Court conseil contextuel (2-3 phrases). Tiens compte de ce qui a déjà été fait dans la séance pour suggérer la suite logique.",
  "plan": [
    {
      "type": "exercice",
      "nom": "Curl haltères",
      "series_suggerees": 3,
      "reps_suggerees": 12,
      "poids_suggere": 15,
      "poids_unite": "${profil?.unite_poids || 'kg'}",
      "raison": "Tu as travaillé le dos, enchaîne avec les biceps"
    }
  ]
}
Retourne UNIQUEMENT le JSON, rien d'autre.`
  }

  if (mode === 'after') {
    const seanceStr = JSON.stringify(seanceEnCours || {}, null, 2)

    // Enrichir avec les données du bilan si disponibles
    let bilanInfo = ''
    if (seanceEnCours?.rpe) {
      bilanInfo += `\nL'utilisateur a indiqué un effort ressenti (RPE) de ${seanceEnCours.rpe}/10.`
    }
    if (seanceEnCours?.duree) {
      bilanInfo += `\nDurée totale de la séance : ${seanceEnCours.duree} minutes.`
    }
    if (seanceEnCours?.calories) {
      bilanInfo += `\nCalories brûlées (Apple Watch) : ${seanceEnCours.calories} kcal.`
    }
    if (seanceEnCours?.total_reps) {
      bilanInfo += `\nVolume de la séance : ${seanceEnCours.total_reps} répétitions totales, ${seanceEnCours.total_charge_kg || 0} kg de charge totale (tonnage).`
    }

    return `Mode : APRÈS SÉANCE — Analyse et recommandations.

Voici la séance que je viens de terminer :
${seanceStr}
${bilanInfo ? '\nDonnées bilan de fin de séance :' + bilanInfo : ''}

Voici mes ${N} dernières séances (hors cette séance) :
${historiqueResume}

Profil : ${profilStr}

Analyse ma séance et donne-moi des recommandations.${bilanInfo ? ' Intègre les données du bilan (RPE, durée, calories) dans ton analyse si disponibles.' : ''} Réponds en JSON avec cette structure :
{
  "message": "Analyse de la séance (3-5 phrases). Points forts, axes d'amélioration, comparaison avec les séances précédentes. Mentionne les PR si applicable. Suggestion pour la prochaine séance.",
  "plan": null
}
Retourne UNIQUEMENT le JSON, rien d'autre.`
  }

  return ''
}

// ── Nettoyer le JSON retourné par le modèle ──
function cleanJsonResponse(text) {
  let cleaned = text.trim()
  // Supprimer les backticks markdown si présents
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  return cleaned.trim()
}

// ── Appel Sonnet avec retry automatique ──
async function callSonnetWithRetry(systemPrompt, userPrompt, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error(`Sonnet attempt ${attempt} failed: ${response.status}`, errBody)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        return { error: true, status: response.status }
      }

      return { error: false, data: await response.json() }
    } catch (err) {
      console.error(`Sonnet attempt ${attempt} network error:`, err)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
      return { error: true, network: true }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// POST /api/coaching — coaching IA via Sonnet (3 modes)
// ══════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const body = await request.json()
    const { mode, profil, historique, seanceEnCours, contexte } = body

    // Validation
    if (!mode || !MODES.includes(mode)) {
      return NextResponse.json(
        { error: `Mode invalide. Valeurs acceptées : ${MODES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Clé API Anthropic manquante.' },
        { status: 500 }
      )
    }

    // Construire les prompts
    const systemPrompt = buildSystemPrompt(profil)
    const userPrompt = buildUserPrompt(mode, profil, historique, seanceEnCours, contexte)

    console.log(`🧠 Coaching ${mode} — appel Sonnet...`)

    // Appel avec retry
    const result = await callSonnetWithRetry(systemPrompt, userPrompt)

    // Si erreur après retry → retourner le fallback (pas d'erreur HTTP)
    if (result.error) {
      console.error(`❌ Coaching ${mode} — échec après retry, fallback activé`)
      return NextResponse.json({
        message: FALLBACK_MESSAGES[mode],
        plan: null,
        fallback: true,
      })
    }

    const rawText = result.data.content?.[0]?.text || ''
    console.log('📝 Réponse brute Sonnet :', rawText.slice(0, 200))

    // Parser le JSON retourné
    let parsed
    try {
      const cleanedJson = cleanJsonResponse(rawText)
      parsed = JSON.parse(cleanedJson)
    } catch (jsonErr) {
      console.error('❌ Erreur parsing JSON coaching :', jsonErr)
      // Fallback si JSON invalide
      return NextResponse.json({
        message: FALLBACK_MESSAGES[mode],
        plan: null,
        fallback: true,
      })
    }

    console.log(`✅ Coaching ${mode} — succès`)
    return NextResponse.json(parsed)

  } catch (err) {
    console.error('❌ Erreur coaching :', err)
    // Fallback ultime — jamais d'erreur HTTP pour ne pas bloquer le flow
    const mode = 'after' // mode par défaut si inconnu
    return NextResponse.json({
      message: FALLBACK_MESSAGES[mode],
      plan: null,
      fallback: true,
    })
  }
}
