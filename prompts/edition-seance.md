# AMÉLIORATION — Édition de séance dans l'historique

## CONTEXTE
FORGE MVP complet, en production.
La page /historique/[id] affiche le détail d'une séance en lecture seule.
On veut ajouter un mode édition pour corriger les erreurs et compléter une séance après coup.

## SCHÉMA DB — RAPPEL (ne pas inventer de colonnes)

```
seances : id, user_id, date, heure_debut, duree_totale, calories_totales, contexte, rpe, texte_brut, notes, template_id, coaching_before, coaching_during, coaching_after
cardio_blocs : id, seance_id, type_cardio, duree_minutes, distance_km, calories, frequence_cardiaque, rpe, ordre
series : id, seance_id, exercice_id, ordre, num_serie, repetitions, poids_kg, notes
exercices : id, nom, categorie, groupe_musculaire, type, is_custom, source, user_id
profils : user_id, unite_poids, ...
```

---

## CE QUE TU DOIS FAIRE

Modifier `app/historique/[id]/page.js` pour ajouter un mode édition toggle.

---

## NOUVEAU FLOW

```
Mode lecture (actuel, par défaut)
  │
  ├── Bouton "✏️ Modifier" dans le header
  │
  ▼
Mode édition (isEditing = true)
  │
  ├── Chaque série : inputs éditables + bouton × supprimer
  ├── Chaque cardio bloc : inputs éditables + bouton × supprimer
  ├── Métadonnées séance éditables (durée, calories, RPE, contexte)
  ├── Section "+ Ajouter" en bas (NLP ou manuel)
  │
  ├── Bouton "✅ Terminé" → quitte le mode édition
  └── Les modifications sont sauvegardées au fur et à mesure (pas de bouton "Sauver tout")
```

---

## 1. TOGGLE MODE ÉDITION

```js
const [isEditing, setIsEditing] = useState(false);
```

**Header de la page :**
- Mode lecture : affichage actuel + bouton "✏️ Modifier" (style ghost, à droite)
- Mode édition : titre "✏️ Modification en cours" (orange) + bouton "✅ Terminé" (gradient forge)

---

## 2. ÉDITION DES SÉRIES (muscu)

En mode édition, chaque série devient une ligne éditable :

```
┌─────────────────────────────────────────────────┐
│  Développé couché                               │
│                                                 │
│  Série 1 : [10] reps × [60 ] kg    [×]         │
│  Série 2 : [10] reps × [60 ] kg    [×]         │
│  Série 3 : [8 ] reps × [55 ] kg    [×]         │
│                                                 │
│  [+ Ajouter une série]                          │
└─────────────────────────────────────────────────┘
```

**Inputs inline :**
- Repetitions : input number, min 1, compact (width 50px)
- Poids : input number, step 0.5, compact (width 60px) — afficher l'unité du profil (kg/lbs)
- inputMode="numeric" pour clavier numérique iPhone
- font-size: 16px (anti-zoom iOS)

**Sauvegarde à la perte de focus (onBlur) :**
```js
async function updateSerie(serieId, field, value) {
  // Si le champ est poids et l'unité est lbs → convertir en kg avant sauvegarde
  let dbValue = value;
  if (field === 'poids_kg' && profil?.unite_poids === 'lbs') {
    dbValue = toKg(parseFloat(value), 'lbs');
  }

  const { error } = await supabase
    .from('series')
    .update({ [field]: dbValue })
    .eq('id', serieId);

  if (error) {
    console.error('Erreur update série:', error);
    // Toast erreur rouge
  }
  // Pas de toast succès pour chaque champ — trop verbeux
}
```

**Bouton × supprimer une série :**
```js
async function deleteSerie(serieId) {
  // Confirmation rapide
  if (!confirm('Supprimer cette série ?')) return;

  const { error } = await supabase
    .from('series')
    .delete()
    .eq('id', serieId);

  if (!error) {
    // Retirer de l'état local immédiatement (optimistic update)
    setSeance(prev => ({
      ...prev,
      series: prev.series.filter(s => s.id !== serieId)
    }));
  }
}
```

**Bouton "+ Ajouter une série" (sous chaque exercice) :**
```js
async function addSerie(exerciceId, ordre) {
  // Pré-remplir avec les valeurs de la dernière série de cet exercice
  const lastSerie = seance.series
    .filter(s => s.exercice_id === exerciceId)
    .sort((a, b) => b.num_serie - a.num_serie)[0];

  const newSerie = {
    seance_id: seance.id,
    exercice_id: exerciceId,
    ordre: ordre,
    num_serie: (lastSerie?.num_serie || 0) + 1,
    repetitions: lastSerie?.repetitions || 10,
    poids_kg: lastSerie?.poids_kg || null,
  };

  const { data, error } = await supabase
    .from('series')
    .insert(newSerie)
    .select('*, exercices(nom, groupe_musculaire, categorie)')
    .single();

  if (data) {
    setSeance(prev => ({
      ...prev,
      series: [...prev.series, data]
    }));
  }
}
```

---

## 3. ÉDITION DES BLOCS CARDIO

Même principe que les séries :

```
┌─────────────────────────────────────────────────┐
│  🚴 Vélo                                        │
│  Durée : [20] min  Calories : [120]  RPE : [7]  │
│                                          [×]     │
└─────────────────────────────────────────────────┘
```

**Champs éditables (onBlur → UPDATE) :**
- type_cardio : select (course / velo / elliptique / tapis / stepper / spinning)
- duree_minutes : input number
- calories : input number (optionnel)
- rpe : input number 1-10 (optionnel)
- distance_km : input number (optionnel)
- frequence_cardiaque : input number (optionnel)

```js
async function updateCardio(blocId, field, value) {
  const { error } = await supabase
    .from('cardio_blocs')
    .update({ [field]: value || null })
    .eq('id', blocId);

  if (error) console.error('Erreur update cardio:', error);
}

async function deleteCardio(blocId) {
  if (!confirm('Supprimer ce bloc cardio ?')) return;

  const { error } = await supabase
    .from('cardio_blocs')
    .delete()
    .eq('id', blocId);

  if (!error) {
    setSeance(prev => ({
      ...prev,
      cardio_blocs: prev.cardio_blocs.filter(b => b.id !== blocId)
    }));
  }
}
```

---

## 4. ÉDITION MÉTADONNÉES SÉANCE

En mode édition, rendre éditables en haut de page :

- **Durée totale** : input number (minutes)
- **Calories totales** : input number
- **RPE global** : pills 1-10 (réutiliser le même composant que l'écran bilan)
- **Contexte** : toggle maison / salle
- **Date** : input date (pour corriger la date si besoin)

Sauvegarde onBlur ou onChange pour les sélecteurs :

```js
async function updateSeance(field, value) {
  const { error } = await supabase
    .from('seances')
    .update({ [field]: value })
    .eq('id', seance.id);

  if (error) console.error('Erreur update séance:', error);
}
```

---

## 5. AJOUTER DES EXERCICES À LA SÉANCE

Section en bas de la page en mode édition :

```
┌─────────────────────────────────────────────────┐
│  + Ajouter à cette séance                       │
│                                                 │
│  [✍️ Texte libre]    [📋 Manuel]                │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Deux onglets/boutons pour choisir le mode :**

### Mode NLP (texte libre)

- Textarea compact (3 lignes) + bouton "⚡ Analyser"
- Appel à /api/parse-seance (identique au flow /seance)
- Écran de validation (réutiliser le même format : cards avec badges catégorie/groupe)
- "✅ Confirmer" → INSERT cardio_blocs + series dans la séance existante
- Auto-learning catalogue : même logique que /seance (ILIKE, normalisation, INSERT si pas trouvé)

```js
async function saveNLPResults(parsedData) {
  const seanceId = seance.id;

  // Insérer les blocs cardio
  if (parsedData.seance.cardio?.length > 0) {
    const cardioRows = parsedData.seance.cardio.map((c, i) => ({
      seance_id: seanceId,
      type_cardio: c.type,
      duree_minutes: c.duree,
      calories: c.calories || null,
      rpe: c.rpe || null,
      distance_km: c.distance || null,
      frequence_cardiaque: c.fc || null,
      ordre: (seance.cardio_blocs?.length || 0) + i,
    }));
    await supabase.from('cardio_blocs').insert(cardioRows);
  }

  // Insérer les séries (avec auto-learning exercices)
  if (parsedData.seance.exercices?.length > 0) {
    for (const exo of parsedData.seance.exercices) {
      // 1. Chercher l'exercice en DB (ILIKE, normalisation)
      // 2. Si pas trouvé → INSERT source='ia_infere'
      // 3. INSERT series avec exercice_id
      // ... même logique que /seance/page.js
    }
  }

  // Recharger la séance complète pour rafraîchir l'affichage
  await reloadSeance();
}
```

⚠️ **IMPORTANT** : la logique d'auto-learning (recherche ILIKE + normalisation accents/underscores + INSERT si pas trouvé) existe déjà dans `/seance/page.js`. **Extraire cette logique dans une fonction utilitaire partagée** pour ne pas dupliquer le code :

```js
// Créer utils/exercice-resolver.js
export async function resolveExercice(supabase, userId, nomBrut, categorie, groupeMusculaire) {
  // 1. Normaliser le nom (minuscules, tirets→espaces, trim)
  // 2. Normaliser categorie et groupe (sans accents, underscores)
  // 3. SELECT ... WHERE nom ILIKE ...
  // 4. Si trouvé → return exercice.id
  // 5. Si pas trouvé → INSERT source='ia_infere' → return new id
}
```

Puis utiliser cette fonction dans `/seance/page.js` ET dans `/historique/[id]/page.js`.

### Mode Manuel

- Sélecteur exercice (catalogue filtrable par groupe — même composant que /templates)
- Formulaire compact : nombre de séries + reps + poids par série
- Bouton "✅ Ajouter" → INSERT series directement

```js
async function addManualExercice(exerciceId, seriesData) {
  const rows = seriesData.map((s, i) => ({
    seance_id: seance.id,
    exercice_id: exerciceId,
    ordre: (seance.series?.length || 0) + 1,
    num_serie: i + 1,
    repetitions: s.reps,
    poids_kg: s.poids ? toKg(s.poids, profil?.unite_poids || 'kg') : null,
  }));

  const { data, error } = await supabase
    .from('series')
    .insert(rows)
    .select('*, exercices(nom, groupe_musculaire, categorie)');

  if (data) {
    setSeance(prev => ({
      ...prev,
      series: [...prev.series, ...data]
    }));
  }
}
```

### Ajout cardio manuel

- Bouton "+ Ajouter cardio" séparé
- Mini-formulaire : type (select), durée (min), calories (optionnel), RPE (optionnel)
- INSERT cardio_blocs

---

## 6. AJOUTER UN BLOC CARDIO MANUELLEMENT

En mode édition, un bouton "+ Ajouter un bloc cardio" à côté de la section cardio :

```
┌─────────────────────────────────────────────────┐
│  Type : [Vélo ▼]  Durée : [20] min              │
│  Calories : [   ]  RPE : [  ]                   │
│                          [✅ Ajouter]            │
└─────────────────────────────────────────────────┘
```

```js
async function addCardioBloc(data) {
  const newBloc = {
    seance_id: seance.id,
    type_cardio: data.type,
    duree_minutes: data.duree,
    calories: data.calories || null,
    rpe: data.rpe || null,
    ordre: (seance.cardio_blocs?.length || 0),
  };

  const { data: inserted, error } = await supabase
    .from('cardio_blocs')
    .insert(newBloc)
    .select()
    .single();

  if (inserted) {
    setSeance(prev => ({
      ...prev,
      cardio_blocs: [...prev.cardio_blocs, inserted]
    }));
  }
}
```

---

## 7. FONCTION RECHARGER LA SÉANCE

Après ajout NLP ou modifications multiples, recharger proprement :

```js
async function reloadSeance() {
  const { data } = await supabase
    .from('seances')
    .select('*, cardio_blocs(*), series(*, exercices(nom, categorie, groupe_musculaire))')
    .eq('id', seanceId)
    .single();

  if (data) setSeance(data);
}
```

---

## DESIGN MODE ÉDITION

**Indicateur visuel clair :**
- Bande orange en haut : "Mode édition" avec bouton "✅ Terminé"
- Fond légèrement différent sur les zones éditables : border orange pointillé ou glow subtil
- Boutons × : rouge (#ef4444), petit (24px), à droite de chaque ligne
- Inputs : fond rgba(255,255,255,0.06), border rgba(255,255,255,0.15), border-radius 6px
- Boutons "+ Ajouter" : style ghost, texte orange, border pointillé

**Mobile-first :**
- Inputs compacts mais touchables (min-height 44px)
- font-size 16px sur tous les inputs (anti-zoom iOS)
- Les boutons × suffisamment espacés pour ne pas supprimer par erreur
- Section "Ajouter" bien séparée visuellement (border-top, margin-top)

---

## NE PAS TOUCHER

- ❌ /api/parse-seance — réutiliser tel quel
- ❌ /api/coaching
- ❌ Schéma DB
- ❌ Autres pages (sauf extraction utils/exercice-resolver.js)
- ❌ Mode lecture existant (il doit rester identique quand isEditing=false)

---

## TEST AVANT COMMIT

1. Ouvrir /historique/[id] → mode lecture normal (rien ne change)
2. Cliquer "✏️ Modifier" → mode édition activé, indicateur orange visible
3. Modifier les reps d'une série → quitter le champ → vérifier UPDATE en DB
4. Modifier le poids d'une série (tester avec profil en lbs) → vérifier conversion kg en DB
5. Supprimer une série → confirmation → série disparaît → vérifier DELETE en DB
6. Ajouter une série à un exercice existant → vérifier pré-remplissage, INSERT en DB
7. Modifier un bloc cardio (durée, calories) → vérifier UPDATE
8. Supprimer un bloc cardio → confirmation → disparaît
9. Ajouter un exercice via NLP → textarea → analyser → valider → séries insérées
10. Ajouter un exercice via mode manuel → sélecteur → reps/poids → inséré
11. Ajouter un bloc cardio manuellement → formulaire → inséré
12. Modifier métadonnées (durée, calories, RPE, contexte) → UPDATE séance
13. Cliquer "✅ Terminé" → retour mode lecture → données à jour
14. Vérifier responsive 375px → inputs touchables, pas de débordement
15. Vérifier que le mode lecture n'a pas changé (coaching repliable, PR badges, etc.)

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Édition séance historique : modifier/supprimer séries et cardio, ajouter exercices NLP ou manuel, édition métadonnées"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Édition séance historique
- Toggle mode édition sur /historique/[id] (bouton ✏️ Modifier / ✅ Terminé)
- Édition inline séries : reps, poids (conversion kg/lbs), sauvegarde onBlur
- Suppression séries et cardio blocs avec confirmation
- Ajout séries à un exercice existant (pré-rempli depuis dernière série)
- Ajout exercices : mode NLP (réutilise /api/parse-seance) ou mode manuel (sélecteur catalogue)
- Ajout cardio blocs manuellement
- Édition métadonnées séance : durée, calories, RPE (pills), contexte, date
- Auto-learning catalogue partagé via utils/exercice-resolver.js
- Optimistic updates + reloadSeance après ajouts NLP
```