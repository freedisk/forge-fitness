// API Route parse-seance — parsing NLP via Claude Haiku
// Reçoit du texte libre, retourne un JSON structuré de la séance

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
11. RPE est une échelle de 1 à 10.`

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

    // Appel à l'API Anthropic (Claude Haiku)
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
      const errorData = await response.text()
      console.error('Erreur API Anthropic:', errorData)
      return Response.json(
        { error: 'Erreur lors de l\'appel à l\'IA.' },
        { status: 500 }
      )
    }

    const data = await response.json()

    // Extraire le texte de la réponse Anthropic
    let rawText = data.content?.[0]?.text || ''

    // Nettoyer les éventuels backticks markdown ajoutés par l'IA
    rawText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Parser le JSON
    const parsed = JSON.parse(rawText)

    return Response.json(parsed, { status: 200 })
  } catch (err) {
    console.error('Erreur parse-seance:', err)
    return Response.json(
      { error: 'Impossible de parser la séance. Réessaie avec une description plus claire.' },
      { status: 500 }
    )
  }
}
