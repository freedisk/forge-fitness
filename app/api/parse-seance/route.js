// API Route parse-seance — parsing NLP via Claude Haiku
// Reçoit du texte libre, retourne un JSON structuré de la séance
// Inclut retry automatique (1 retry, 1.5s délai) + validation structurelle

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans le parsing de séances de fitness.
L'utilisateur décrit sa séance en langage naturel (français ou anglais).
Tu dois analyser le texte et retourner UNIQUEMENT un objet JSON valide, sans aucun texte avant ou après.

Structure JSON attendue :
{
  "cardio": [
    {
      "type_cardio": "velo|course|elliptique|tapis|stepper|spinning|rameur|corde_a_sauter",
      "duree_minutes": number,
      "distance_km": number|null,
      "calories": number|null,
      "frequence_cardiaque": number|null,
      "rpe": number|null
    }
  ],
  "exercices": [
    {
      "nom": "Nom normalisé de l'exercice",
      "categorie": "poids_corps|musculation|mobilite|autres",
      "groupe_musculaire": "pecs|dos|epaules|biceps|triceps|jambes|abdos|full_body",
      "type": "poids_corps|halteres|barre|machine",
      "series": [
        {
          "num_serie": 1,
          "repetitions": number,
          "poids_kg": number|null,
          "unite_detectee": "kg|lbs|null"
        }
      ]
    }
  ]
}

Règles IMPÉRATIVES :
1. Retourne UNIQUEMENT le JSON, rien d'autre. Pas de markdown, pas de commentaire.
2. Si l'utilisateur écrit "3x20" → 3 séries de 20 reps.
3. Si l'utilisateur écrit "8 8 6" → 3 séries de 8, 8 et 6 reps.
4. Si un poids est mentionné en lbs (ex: "135 lbs", "135 pounds", "135lb"), mets poids_kg = valeur / 2.20462 (arrondi 2 décimales) ET unite_detectee = "lbs".
5. Si un poids est mentionné en kg (ex: "60kg", "60 kilos"), mets poids_kg = valeur ET unite_detectee = "kg".
6. Si un poids est mentionné sans unité (ex: "60"), mets poids_kg = valeur ET unite_detectee = null.
7. Si pas de poids (poids du corps) → poids_kg = null, unite_detectee = null.
8. Normalise les noms d'exercices en français avec une majuscule initiale (ex: "bench press" → "Développé couché", "pull ups" → "Tractions").
9. Le champ "nom" doit être le nom canonique normalisé — c'est ce nom qui sera cherché dans le catalogue existant.
10. cardio et exercices sont des tableaux — ils peuvent être vides [] si non mentionnés.
11. RPE est une échelle de 1 à 10.
12. CRITIQUE — Les valeurs de "categorie" doivent être EXACTEMENT une de ces valeurs techniques, en minuscules avec underscores : poids_corps, musculation, mobilite, cardio, autres. JAMAIS "Poids corps", "Poids Corps", ni d'espaces.
13. CRITIQUE — Les valeurs de "groupe_musculaire" doivent être EXACTEMENT une de ces valeurs techniques, en minuscules avec underscores : pecs, dos, epaules, biceps, triceps, jambes, abdos, full_body. JAMAIS "Full Body", "Épaules", ni de majuscules/accents. Pour le cardio, groupe_musculaire = null.
14. CRITIQUE — Les valeurs de "type" doivent être EXACTEMENT : poids_corps, halteres, barre, machine. JAMAIS d'espaces ni de majuscules.`

// ── Appel Haiku avec retry automatique ──
async function callHaikuWithRetry(texte, maxRetries = 1) {
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: texte }],
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error(`Haiku attempt ${attempt} failed: ${response.status}`, errBody)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        return { error: `Erreur IA (${response.status}). Réessaie ou utilise le mode manuel.` }
      }

      return await response.json()
    } catch (err) {
      console.error(`Haiku attempt ${attempt} network error:`, err)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
      return { error: 'Connexion impossible. Vérifie ta connexion ou réessaie.' }
    }
  }
}

// ── Validation structurelle du résultat parsé ──
function validateParseResult(result) {
  if (!result || typeof result !== 'object') return false
  // Au moins un exercice ou un bloc cardio
  const hasExercices = Array.isArray(result.exercices) && result.exercices.length > 0
  const hasCardio = Array.isArray(result.cardio) && result.cardio.length > 0
  return hasExercices || hasCardio
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { texte } = body

    // Validation du texte
    if (!texte || texte.trim().length === 0) {
      return Response.json(
        { error: 'Le texte de la séance est requis.' },
        { status: 400 }
      )
    }

    // Texte trop court
    if (texte.trim().length < 5) {
      return Response.json(
        { error: 'Décris au moins un exercice (ex: "pompes 3x20").' },
        { status: 400 }
      )
    }

    // Appel Haiku avec retry
    const data = await callHaikuWithRetry(texte.trim())

    // Si erreur retournée par le retry
    if (data.error) {
      return Response.json({ error: data.error }, { status: 502 })
    }

    // Extraire le texte de la réponse Anthropic
    let rawText = data.content?.[0]?.text || ''

    // Nettoyer les éventuels backticks markdown ajoutés par l'IA
    rawText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Parser le JSON
    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch (jsonErr) {
      console.error('Erreur parsing JSON Haiku :', jsonErr, 'Texte brut :', rawText.slice(0, 200))
      return Response.json(
        { error: "L'IA n'a pas retourné un format valide. Reformule ta séance." },
        { status: 422 }
      )
    }

    // Validation structurelle
    if (!validateParseResult(parsed)) {
      return Response.json(
        { error: "L'IA n'a pas réussi à comprendre ta séance. Reformule ou ajoute plus de détails." },
        { status: 422 }
      )
    }

    return Response.json(parsed, { status: 200 })
  } catch (err) {
    console.error('Erreur parse-seance:', err)
    return Response.json(
      { error: 'Impossible de parser la séance. Réessaie avec une description plus claire.' },
      { status: 500 }
    )
  }
}
