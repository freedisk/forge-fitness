# AMÉLIORATION — Mode de saisie manuel sur /seance

## CONTEXTE
FORGE MVP complet. La saisie de séance passe par 3 modes :
- NLP (texte libre → Haiku → validation → DB) ✅ en place
- Templates (1 tap → checklist guidée) ✅ en place
- Manuel (sélecteur catalogue → séries tap-by-tap) ❌ PAS ENCORE IMPLÉMENTÉ

Le CDC prévoyait le mode manuel dès le début. Les deux modes doivent coexister dans la même séance — l'utilisateur bascule librement. Même résultat en DB.

Le mode manuel = zéro IA, zéro coût API. Sélection exercice via catalogue → saisie série par série.

## SCHÉMA DB — RAPPEL

```
exercices : id, nom, categorie, groupe_musculaire, type, is_custom, source, user_id
seances : id, user_id, date, heure_debut, duree_totale, calories_totales, contexte, rpe, texte_brut, ...
cardio_blocs : id, seance_id, type_cardio, duree_minutes, distance_km, calories, frequence_cardiaque, rpe, ordre
series : id, seance_id, exercice_id, ordre, num_serie, repetitions, poids_kg, notes
profils : user_id, unite_poids, ...
```

⚠️ Noms exacts en DB : `categorie` et `groupe_musculaire` sont SANS accents et avec UNDERSCORES (ex: "epaules", "full_body", "poids_corps").

---

## CE QUE TU DOIS FAIRE

Ajouter le mode de saisie manuel dans `app/seance/page.js`, intégré au flow existant.

---

## DESIGN — Toggle NLP / Manuel

En haut de la zone de saisie (en état idle ET active), ajouter un toggle entre les deux modes :

```
┌───────────────────────────────────┐
│  [✍️ Texte libre]  [📋 Manuel]    │  ← 2 onglets, un seul actif à la fois
└───────────────────────────────────┘
```

```js
const [inputMode, setInputMode] = useState('nlp'); // 'nlp' | 'manual'
```

- Onglet actif : fond orange, texte blanc (NLP) ou fond bleu, texte blanc (Manuel)
- Onglet inactif : fond transparent, texte muted, border
- Le toggle est TOUJOURS visible (en idle et en active)
- Changer de mode ne perd PAS les données de la séance en cours — c'est juste la méthode de saisie qui change

**Quand NLP est actif** → afficher la zone textarea + bouton Analyser (comportement actuel inchangé)
**Quand Manuel est actif** → afficher le sélecteur catalogue + formulaire séries (nouveau)

---

## MODE MANUEL — Interface complète

### Étape 1 : Sélectionner un exercice

**Sélecteur filtrable par groupe musculaire :**

```
┌─────────────────────────────────────────┐
│  📋 Ajouter un exercice                 │
│                                         │
│  [Tous] [Pecs] [Dos] [Épaules]         │
│  [Biceps] [Triceps] [Jambes] [Abdos]   │  ← Pills filtre groupe musculaire
│  [Cardio]                               │
│                                         │
│  🔍 Rechercher...                       │  ← Input recherche optionnel
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Pompes        Poids corps      │    │
│  │  Tractions     Poids corps      │    │
│  │  Développé couché  Barre        │    │  ← Liste scrollable, tap pour sélectionner
│  │  Curl haltères     Haltères     │    │
│  │  ...                            │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Chargement du catalogue :**
```js
// Charger les exercices (globaux + perso) — même requête que /exercices
const { data: exercices } = await supabase
  .from('exercices')
  .select('*')
  .or('user_id.is.null,user_id.eq.' + user.id)
  .order('nom');
```

**Filtres groupe musculaire :**
- Pills horizontales scrollables (même style que /exercices)
- "Tous" sélectionné par défaut
- Filtre spécial "Cardio" → filtre sur categorie='cardio' au lieu de groupe_musculaire
- Les pills sans accents en filtre DB mais avec accents en label : "Épaules" filtre `groupe_musculaire = 'epaules'`

**Recherche :**
- Input texte, filtre instantané sur le nom de l'exercice
- Insensible à la casse et aux accents (normaliser avant comparaison)
- Combinable avec le filtre groupe

**Au tap sur un exercice :**
- Si c'est un exercice cardio (categorie='cardio') → ouvrir le formulaire cardio
- Sinon → ouvrir le formulaire séries

---

### Étape 2a : Formulaire séries (exercice muscu/poids corps)

Après sélection d'un exercice :

```
┌─────────────────────────────────────────┐
│  💪 Développé couché                    │
│  Dernière fois : 3×10 × 60kg (il y a 3j)│  ← Contexte historique (voir section dédiée)
│                                         │
│  Série 1 : [10] reps  × [60 ] kg  [×]  │
│  Série 2 : [10] reps  × [60 ] kg  [×]  │
│  Série 3 : [10] reps  × [60 ] kg  [×]  │
│                                         │
│  [+ Ajouter une série]                  │
│                                         │
│  [✅ Enregistrer]        [← Retour]     │
└─────────────────────────────────────────┘
```

**Pré-remplissage intelligent :**
```js
// Charger la dernière performance pour cet exercice
async function getLastPerformance(exerciceId) {
  const { data } = await supabase
    .from('series')
    .select('num_serie, repetitions, poids_kg, seances!inner(date)')
    .eq('exercice_id', exerciceId)
    .order('seances(date)', { ascending: false })
    .limit(20); // prendre les N dernières séries de la dernière séance

  if (!data || data.length === 0) return null;

  // Grouper par la date la plus récente
  const lastDate = data[0].seances.date;
  const lastSeries = data.filter(s => s.seances.date === lastDate);

  return {
    date: lastDate,
    series: lastSeries.sort((a, b) => a.num_serie - b.num_serie)
  };
}
```

**Si une dernière performance existe :**
- Afficher "Dernière fois : [résumé] (il y a Xj)" en texte muted
- Pré-remplir le même nombre de séries avec les mêmes reps/poids
- L'utilisateur peut modifier chaque valeur

**Si pas de dernière performance :**
- 3 séries vides par défaut
- Reps : placeholder "10"
- Poids : vide (null = poids du corps)

**State local du formulaire :**
```js
const [manualSeries, setManualSeries] = useState([
  { reps: 10, poids: null },
  { reps: 10, poids: null },
  { reps: 10, poids: null },
]);
```

**Bouton "+ Ajouter une série" :**
- Duplique la dernière série du formulaire
- Max 10 séries (au-delà c'est probablement une erreur)

**Bouton × sur chaque série :**
- Retire la série du formulaire (pas de confirmation, c'est avant sauvegarde)
- Minimum 1 série

**Inputs :**
- Reps : input number, min 1, width 50px, inputMode="numeric"
- Poids : input number, step 0.5, width 70px, inputMode="decimal"
- Afficher l'unité du profil (kg ou lbs) à côté du champ
- font-size 16px (anti-zoom iOS)

**Bouton "✅ Enregistrer" :**
```js
async function saveManualExercice(exerciceId, seriesData) {
  // 1. Si pas de séance active → créer la séance d'abord
  let seanceId = activeSeanceId;
  if (!seanceId) {
    const { data: newSeance } = await supabase
      .from('seances')
      .insert({
        user_id: user.id,
        date: new Date().toISOString().split('T')[0],
        heure_debut: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        contexte: 'maison', // défaut, ou reprendre le sélecteur contexte
      })
      .select()
      .single();

    seanceId = newSeance.id;
    setActiveSeanceId(seanceId);
    // Persister dans localStorage
    localStorage.setItem('forge_active_seance', seanceId);
  }

  // 2. Calculer l'ordre (après les exercices déjà enregistrés)
  const maxOrdre = existingSeries
    .filter(s => s.seance_id === seanceId)
    .reduce((max, s) => Math.max(max, s.ordre || 0), 0);

  // 3. INSERT les séries
  const rows = seriesData.map((s, i) => ({
    seance_id: seanceId,
    exercice_id: exerciceId,
    ordre: maxOrdre + 1,
    num_serie: i + 1,
    repetitions: parseInt(s.reps),
    poids_kg: s.poids ? toKg(parseFloat(s.poids), profil?.unite_poids || 'kg') : null,
  }));

  const { data, error } = await supabase
    .from('series')
    .insert(rows)
    .select('*, exercices(nom, groupe_musculaire, categorie)');

  if (!error) {
    // Toast succès "Développé couché ajouté ✅"
    // Remettre le formulaire en mode sélection exercice
    // Ajouter les séries à l'état local de la séance
  }
}
```

**Bouton "← Retour" :**
- Retour au sélecteur d'exercices (pas de perte de données de la séance)

---

### Étape 2b : Formulaire cardio (si exercice cardio sélectionné)

```
┌─────────────────────────────────────────┐
│  🚴 Vélo                                │
│                                         │
│  Durée :    [   ] min                   │
│  Distance : [   ] km     (optionnel)    │
│  Calories : [   ]        (optionnel)    │
│  FC moy :   [   ] bpm    (optionnel)    │
│  RPE :      [   ] / 10   (optionnel)    │
│                                         │
│  [✅ Enregistrer]        [← Retour]     │
└─────────────────────────────────────────┘
```

- Durée : seul champ obligatoire
- Tous les autres : optionnels (null si vides)
- INSERT dans cardio_blocs (même logique : créer la séance si nécessaire)

```js
async function saveManualCardio(exercice, cardioData) {
  let seanceId = activeSeanceId;
  if (!seanceId) {
    // ... créer la séance (même logique)
  }

  const { data, error } = await supabase
    .from('cardio_blocs')
    .insert({
      seance_id: seanceId,
      type_cardio: exercice.nom.toLowerCase(), // "vélo" → "vélo"
      duree_minutes: parseInt(cardioData.duree),
      distance_km: cardioData.distance ? parseFloat(cardioData.distance) : null,
      calories: cardioData.calories ? parseInt(cardioData.calories) : null,
      frequence_cardiaque: cardioData.fc ? parseInt(cardioData.fc) : null,
      rpe: cardioData.rpe ? parseInt(cardioData.rpe) : null,
      ordre: (existingCardio?.length || 0),
    })
    .select();

  if (!error) {
    // Toast succès "Vélo ajouté ✅"
    // Retour au sélecteur d'exercices
  }
}
```

---

## RÉCAP SÉANCE EN COURS (affiché en permanence)

En état `active` (séance en cours), que ce soit en mode NLP ou manuel, afficher un **résumé compact** de ce qui a déjà été enregistré dans la séance :

```
┌─────────────────────────────────────────┐
│  📋 Séance en cours                     │
│                                         │
│  🚴 Vélo · 20 min                      │
│  💪 Pompes · 3×20                       │
│  💪 Développé couché · 3×10 × 60kg     │
│                                         │
│  3 exercices · ~30 min                  │
└─────────────────────────────────────────┘
```

Ce récap existe peut-être déjà partiellement dans le flow multi-passes. S'il existe → s'assurer qu'il affiche aussi les exercices ajoutés en mode manuel. S'il n'existe pas → le créer.

Ce bloc est affiché ENTRE le toggle NLP/Manuel et la zone de saisie, en permanence quand une séance est active.

---

## DERNIÈRE PERFORMANCE (contexte historique)

C'est une fonctionnalité à haute valeur. Quand l'utilisateur sélectionne un exercice en mode manuel :

```js
// Afficher au-dessus du formulaire séries
// "Dernière fois : 3×10 × 60kg — il y a 3 jours"
// Ou "Première fois pour cet exercice"

function formatLastPerformance(lastPerf, unite) {
  if (!lastPerf) return "Première fois pour cet exercice 💪";

  const { series, date } = lastPerf;
  const daysAgo = Math.floor((new Date() - new Date(date)) / 86400000);
  const daysLabel = daysAgo === 0 ? "aujourd'hui"
    : daysAgo === 1 ? "hier"
    : `il y a ${daysAgo}j`;

  // Résumer les séries : "3×10 × 60kg" ou "3 séries : 8, 8, 6 reps"
  const allSameReps = series.every(s => s.repetitions === series[0].repetitions);
  const poids = series[0].poids_kg;

  if (allSameReps && poids) {
    return `${series.length}×${series[0].repetitions} × ${toDisplay(poids, unite)}${unitLabel(unite)} — ${daysLabel}`;
  } else if (allSameReps) {
    return `${series.length}×${series[0].repetitions} reps — ${daysLabel}`;
  } else {
    const repsStr = series.map(s => s.repetitions).join(', ');
    const poidsStr = poids ? ` × ${toDisplay(poids, unite)}${unitLabel(unite)}` : '';
    return `${series.length} séries : ${repsStr}${poidsStr} — ${daysLabel}`;
  }
}
```

Style : texte muted 12px, légèrement italic, sous le nom de l'exercice.

---

## INTÉGRATION AVEC LE FLOW EXISTANT

**⚠️ RÈGLES CRITIQUES :**

1. **Le mode NLP ne change PAS** — tout le code NLP existant (textarea, parsing, validation, multi-passes) reste identique quand inputMode='nlp'
2. **Le toggle est cosmétique** — il change juste ce qui est affiché, pas l'état de la séance
3. **La séance active est la même** — que tu ajoutes en NLP ou en manuel, c'est le même activeSeanceId, la même séance en DB
4. **Multi-passes mixte** — tu peux faire 2 exercices en manuel, puis switcher en NLP pour un bloc texte, puis revenir en manuel. Tout s'additionne
5. **Persistance localStorage** — le mode de saisie actif peut être persisté (optionnel) mais la séance active (forge_active_seance) est la même
6. **Templates** — quand une séance est lancée depuis un template, le toggle NLP/Manuel est disponible pour ajouter des exercices hors template
7. **Coaching** — le coaching before/during/after fonctionne identiquement, quel que soit le mode de saisie
8. **Bouton "Terminer"** — identique, déclenche le bilan + coaching after

---

## DESIGN

**Toggle NLP / Manuel :**
- 2 pills côte à côte, pleine largeur répartie 50/50
- NLP actif : fond rgba(249,115,22,0.15), texte orange, border orange
- Manuel actif : fond rgba(59,130,246,0.15), texte bleu (#3b82f6), border bleu
- Transition douce (0.2s) entre les modes

**Sélecteur exercice :**
- Pills groupes : scrollable horizontalement, style identique à /exercices
- Liste exercices : max-height 300px, overflow-y scroll, fond surface
- Chaque exercice : padding 12px, border-bottom fine, nom bold + type en muted
- Badges source si is_custom : 🧠 violet (ia_infere), ✏️ bleu (manuel)
- Tap → highlight orange 0.15s → formulaire

**Formulaire séries :**
- Compact, chaque série sur une ligne
- Inputs petits mais touchables (44px height min)
- Bouton × discret à droite
- Bouton "+ Ajouter série" : ghost, texte muted, border pointillé
- Bouton "✅ Enregistrer" : gradient forge, pleine largeur

**Dernière performance :**
- Fond rgba(255,255,255,0.03), border-left 3px blue, padding 10px
- Texte muted italic 12px

**Responsive mobile 375px :**
- Toggle pleine largeur
- Sélecteur exercice pleine largeur
- Formulaire séries : reps et poids côte à côte (pas empilés)
- Tous inputs font-size 16px (anti-zoom iOS)

---

## NE PAS TOUCHER

- ❌ /api/parse-seance, /api/coaching — aucune modification
- ❌ Flow NLP existant (textarea, parsing, validation, multi-passes)
- ❌ Flow templates existant (checklist guidée)
- ❌ Flow bilan fin de séance
- ❌ Coaching before/during/after
- ❌ Schéma DB
- ❌ Autres pages

---

## TEST AVANT COMMIT

1. Page /seance → vérifier toggle NLP / Manuel visible
2. Mode NLP → tout fonctionne comme avant (aucune régression)
3. Mode Manuel → sélecteur exercice affiché, pills groupes fonctionnent
4. Filtrer par groupe → liste mise à jour
5. Rechercher un exercice par nom → filtrage instantané
6. Sélectionner un exercice muscu → formulaire séries affiché
7. Vérifier pré-remplissage dernière performance (si historique existe)
8. Modifier reps/poids → enregistrer → toast succès → séries en DB
9. Sélectionner un exercice cardio → formulaire cardio affiché
10. Enregistrer un cardio → toast succès → cardio_blocs en DB
11. Vérifier récap séance en cours (tous les exercices ajoutés visibles)
12. Switcher NLP → ajouter un exercice en texte → confirmer → revenir en Manuel
13. Vérifier que tout est dans la même séance en DB
14. Terminer la séance → bilan + coaching after fonctionnent
15. Vérifier responsive 375px → toggle, sélecteur, formulaire touchables
16. Tester conversion kg/lbs si profil en lbs

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Mode saisie manuel : sélecteur catalogue, formulaire séries/cardio, dernière performance, toggle NLP/Manuel mixable"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Mode saisie manuel
- Toggle NLP / Manuel sur /seance (onglets orange/bleu)
- Sélecteur exercice : catalogue filtrable par groupe musculaire + recherche
- Formulaire séries : reps + poids (conversion kg/lbs), pré-rempli depuis dernière performance
- Formulaire cardio : durée + distance + calories + FC + RPE (optionnels)
- Dernière performance affichée au-dessus du formulaire ("3×10 × 60kg — il y a 3j")
- Mixable avec NLP dans la même séance (même activeSeanceId)
- Récap séance en cours visible en permanence
- Zéro IA, zéro coût API — INSERT direct en DB
```