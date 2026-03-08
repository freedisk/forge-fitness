# PROMPT ÉTAPE 7 — API Route coaching (Sonnet) — 3 modes + UI coaching

## CONTEXTE
Projet FORGE — app fitness mobile-first. Étapes 1-6 terminées.
Saisie NLP fonctionnelle, historique avec détail et PR en place.
Lis CLAUDE.md pour le contexte complet.

## CONCEPT
Le coaching IA est le deuxième pilier de FORGE. L'IA analyse le profil utilisateur + les N dernières séances pour donner des conseils personnalisés. 3 modes selon le moment :
- **Before** : propose un plan de séance quand l'utilisateur n'est pas inspiré
- **During** : suggère la suite en fonction de ce qui a déjà été fait dans la séance en cours
- **After** : analyse la séance terminée + recommandations pour la prochaine

Tout ce qui vient du coaching IA est affiché en **violet (#a855f7 / #c084fc)** — distinction permanente avec les données utilisateur (orange).

---

## CE QUE TU DOIS FAIRE — 3 SOUS-PARTIES

### PARTIE A — API Route `/api/coaching/route.js`

Server-side. Reçoit le mode + les données contextuelles et retourne des suggestions via Claude Sonnet.

**Endpoint :**
- Méthode : POST
- Body : `{ "mode": "before|during|after", "profil": {...}, "historique": [...], "seanceEnCours": {...} | null }`
- Réponse : `{ "message": "texte de coaching", "plan": [...] | null }`

**Modèle :** `claude-sonnet-4-5-20250514`

**Clé API :** `process.env.ANTHROPIC_API_KEY`

**Prompt système (commun aux 3 modes) :**

```
Tu es un coach fitness personnel bienveillant et compétent. Tu t'adresses à un homme de {age} ans, {poids_kg} kg, {taille_cm} cm, niveau {niveau}, objectif {objectif}. Il s'entraîne à {contextes_dispo}. Il préfère les unités en {unite_poids}.

Tu analyses son historique d'entraînement pour donner des conseils personnalisés, progressifs et motivants.

Règles :
1. Toujours répondre en FRANÇAIS.
2. Être concis — pas de blabla, aller droit aux conseils pratiques.
3. Si tu suggères des poids, utiliser l'unité préférée de l'utilisateur ({unite_poids}).
4. Encourager la progression sans pousser au surentraînement.
5. Varier les groupes musculaires pour l'équilibre.
6. Adapter au contexte (maison vs salle) — ne pas suggérer des machines si l'utilisateur est à la maison.
```

**Prompt utilisateur selon le mode :**

**MODE "before" :**
```
Mode : AVANT SÉANCE — Propose un plan d'entraînement.

Voici mes {N} dernières séances :
{historique JSON}

Profil : {profil JSON}

Contexte aujourd'hui : {maison|salle}

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
      "poids_unite": "kg",
      "raison": "Tu as fait 3×8 la dernière fois, +1 rep pour progresser"
    }
  ]
}
Retourne UNIQUEMENT le JSON, rien d'autre.
```

**MODE "during" :**
```
Mode : PENDANT SÉANCE — Suggère la suite.

Voici ce que j'ai déjà fait dans cette séance :
{seanceEnCours JSON — cardio_blocs + series avec noms exercices}

Voici mes {N} dernières séances (hors séance en cours) :
{historique JSON}

Profil : {profil JSON}

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
      "poids_unite": "kg",
      "raison": "Tu as travaillé le dos, enchaîne avec les biceps"
    }
  ]
}
Retourne UNIQUEMENT le JSON, rien d'autre.
```

**MODE "after" :**
```
Mode : APRÈS SÉANCE — Analyse et recommandations.

Voici la séance que je viens de terminer :
{seanceEnCours JSON — complète avec cardio + exercices + séries}

Voici mes {N} dernières séances (hors cette séance) :
{historique JSON}

Profil : {profil JSON}

Analyse ma séance et donne-moi des recommandations. Réponds en JSON avec cette structure :
{
  "message": "Analyse de la séance (3-5 phrases). Points forts, axes d'amélioration, comparaison avec les séances précédentes. Mentionne les PR si applicable. Suggestion pour la prochaine séance.",
  "plan": null
}
Retourne UNIQUEMENT le JSON, rien d'autre.
```

**Code de la route :**
- Vérifier le body (mode requis, profil requis)
- Construire le prompt utilisateur selon le mode
- Limiter l'historique aux 10 dernières séances (pas tout l'historique)
- Pour l'historique, envoyer un résumé compact (pas les objets complets) : date, contexte, liste exercices avec séries/reps/poids, cardio résumé
- Appeler l'API Anthropic avec system prompt + user prompt
- Nettoyer le JSON retourné (supprimer backticks markdown si présents)
- Parser et retourner
- max_tokens : 2000
- En cas d'erreur → status 500 avec message

**Format fetch Anthropic :**
```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
});
```

---

### PARTIE B — Récupération du contexte (historique + profil)

Créer une fonction utilitaire ou intégrer directement dans la page séance :

**Charger le profil :**
```javascript
const { data: profil } = await supabase
  .from('profils')
  .select('*')
  .eq('user_id', session.user.id)
  .single()
```

**Charger les N dernières séances avec détails :**
```javascript
const { data: historique } = await supabase
  .from('seances')
  .select(`
    id, date, contexte, duree_totale,
    cardio_blocs(type_cardio, duree_minutes, rpe, calories),
    series(num_serie, repetitions, poids_kg, exercices(nom, categorie, groupe_musculaire))
  `)
  .eq('user_id', session.user.id)
  .order('date', { ascending: false })
  .limit(10)
```

**Résumer l'historique** avant envoi à l'API (pour réduire la taille du payload) :
Pour chaque séance, créer un objet compact :
```javascript
{
  date: "2026-03-08",
  contexte: "salle",
  cardio: "Vélo 20min RPE 7",
  exercices: [
    "Pompes 3×20",
    "Tractions 3×8",
    "Développé couché 3×10 60kg"
  ]
}
```

---

### PARTIE C — Interface coaching dans la page séance

Modifier `app/seance/page.js` pour intégrer le coaching aux 3 moments.

**1. Coaching BEFORE — affiché en état `idle` (pas de séance en cours) :**
- Bouton "🧠 Demander un plan au coach" en dessous de la textarea
- Style : fond rgba(168,85,247,0.1), bordure rgba(168,85,247,0.2), texte #c084fc, full width
- Au clic : charger profil + historique → appel /api/coaching mode "before" → afficher le résultat
- Affichage du coaching :
  - Bloc violet : message de coaching (texte du coach)
  - Si plan retourné : liste des exercices suggérés en cards violettes compactes
    - Chaque card : nom exercice · séries × reps (× poids si suggéré) · raison en petit texte
  - Bouton "Utiliser ce plan →" : copie le plan sous forme de texte dans la textarea et lance automatiquement l'analyse
    - Ex: "vélo 15 min RPE 6, tractions 3x9, curl haltères 15kg 3x12"

**2. Coaching DURING — affiché en état `active` (séance en cours) :**
- Bouton "🧠 Quoi faire ensuite ?" à côté ou en dessous de la textarea d'ajout
- Style : même style violet que le bouton before
- Au clic : charger profil + historique + données séance en cours → appel /api/coaching mode "during" → afficher
- Affichage : même format que le before (message + suggestions)
- Bouton "Ajouter ces suggestions" : copie dans la textarea et lance l'analyse

**3. Coaching AFTER — affiché après "Terminer la séance" :**
- Quand l'utilisateur clique "Terminer la séance" :
  1. Update durée en DB (comme avant)
  2. Appeler /api/coaching mode "after" avec la séance complète
  3. Afficher un écran de bilan avant la redirection :
    - Fond légèrement violet
    - Message d'analyse du coach (texte)
    - Bouton "OK, compris 💪" → rediriger vers /
- Si l'appel coaching échoue → ne pas bloquer, rediriger quand même vers / (le coaching after est un bonus)

**Design coaching — tout en violet :**
- Fond des blocs coaching : rgba(168,85,247,0.08)
- Bordure : rgba(168,85,247,0.2)
- Texte coaching : #c084fc
- Badges/pills : fond rgba(168,85,247,0.15), texte #c084fc
- Boutons coaching : fond rgba(168,85,247,0.12), texte #c084fc, bordure rgba(168,85,247,0.25)
- Icône : 🧠 devant chaque élément IA

---

## NE PAS FAIRE
- Ne PAS implémenter les templates (étape 8)
- Ne PAS implémenter le dashboard/heatmap (étape 9)
- Ne pas toucher à l'historique, au catalogue, au profil, au login
- Ne pas modifier l'API Route parse-seance
- Ne pas installer de packages

## STRUCTURE APRÈS ÉTAPE 7
```
app/
├── seance/
│   └── page.js                ← MODIFIÉ (coaching before/during/after intégré)
└── api/
    ├── parse-seance/
    │   └── route.js           ← Existant (ne pas modifier)
    └── coaching/
        └── route.js           ← NOUVEAU (coaching 3 modes via Sonnet)
```

## RÈGLES
- Commentaires en FRANÇAIS
- Noms fichiers/variables en ANGLAIS
- JavaScript uniquement
- Tailwind CSS, mobile-first
- Tout ce qui vient de l'IA = violet (#a855f7 / #c084fc)
- Le coaching est un BONUS — si l'appel échoue, ne jamais bloquer le flow principal
- Gérer les 4 états : chargement, erreur, vide, succès

## TESTS

### Test 1 — Coaching BEFORE
1. localhost:3000/seance (pas de séance en cours)
2. Cliquer "🧠 Demander un plan au coach"
3. Attendre la réponse (spinner violet pendant le chargement)
4. Vérifier : message motivant + plan avec exercices suggérés + raisons
5. Cliquer "Utiliser ce plan" → la textarea se remplit → analyser automatiquement

### Test 2 — Coaching DURING
1. Démarrer une séance, confirmer un premier bloc
2. En état "active", cliquer "🧠 Quoi faire ensuite ?"
3. Vérifier : la suggestion tient compte de ce qui a déjà été fait (pas de doublon d'exercices)

### Test 3 — Coaching AFTER
1. Terminer une séance
2. Un écran de bilan violet apparaît avec l'analyse du coach
3. Cliquer "OK, compris" → redirection vers /

### Test 4 — Pas de profil
1. Si l'utilisateur n'a pas rempli son profil → le coaching doit quand même fonctionner avec des valeurs par défaut ou afficher un message "Remplis ton profil pour un coaching personnalisé" avec un lien vers /profil

### Test 5 — Erreur API
1. Simuler une erreur (ex: couper le réseau temporairement)
2. Le coaching affiche une erreur discrète, le flow principal n'est pas bloqué