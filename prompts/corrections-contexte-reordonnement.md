# CORRECTIONS — 3 trous mineurs restants

## CONTEXTE
FORGE complet en production. 3 incohérences mineures identifiées à corriger.

---

# CORRECTION 1 — Sélecteur contexte maison/salle en mode manuel

## PROBLÈME
En mode NLP, le sélecteur contexte (Maison/Salle) apparaît sur l'écran de validation.
En mode manuel, la séance est créée via `ensureSeance()` avec `contexte: 'maison'` par défaut — l'utilisateur ne peut pas choisir.
En mode template, le contexte vient du template — OK.

## FICHIER : `app/seance/page.js`

### Solution : Sélecteur contexte persistant en haut de l'écran de séance

Ajouter un toggle Maison/Salle visible en état `idle` ET `active`, au-dessus du toggle NLP/Manuel :

```
┌─────────────────────────────────────────┐
│  🏠 Maison    🏋️ Salle                  │  ← Toggle contexte (nouveau)
├─────────────────────────────────────────┤
│  [✍️ Texte libre]  [📋 Manuel]          │  ← Toggle mode saisie (existant)
├─────────────────────────────────────────┤
│  ...                                    │
└─────────────────────────────────────────┘
```

```js
const [selectedContexte, setSelectedContexte] = useState('maison');
```

**Design :**
- 2 pills côte à côte, pleine largeur 50/50
- Maison actif : fond rgba(59,130,246,0.15), texte bleu, icône 🏠
- Salle actif : fond rgba(249,115,22,0.15), texte orange, icône 🏋️
- Style plus discret que le toggle NLP/Manuel (border fine, pas de fond épais)

**Intégration avec ensureSeance() :**
```js
// Modifier ensureSeance() pour utiliser selectedContexte au lieu de 'maison' en dur
async function ensureSeance() {
  if (activeSeanceId) return activeSeanceId;

  const { data: newSeance } = await supabase
    .from('seances')
    .insert({
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
      heure_debut: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      contexte: selectedContexte,  // ← UTILISER LE STATE au lieu de 'maison'
    })
    .select()
    .single();

  // ... reste identique
}
```

**Quand un template est lancé :**
- Le contexte du template override le sélecteur : `contexte: template.contexte || selectedContexte`
- Mettre à jour le sélecteur visuel pour refléter le contexte du template

**Quand une séance est restaurée depuis localStorage :**
- Charger le contexte depuis la séance en DB et mettre à jour le sélecteur

**En état active (séance en cours) :**
- Le sélecteur contexte reste visible mais **désactivé** (grisé) — le contexte est fixé à la création
- Afficher une indication : "🏠 Maison" ou "🏋️ Salle" en lecture seule
- Pour modifier le contexte d'une séance en cours → passer par le mode édition dans l'historique

---

# CORRECTION 2 — Type cardio éditable en mode édition

## PROBLÈME
En mode édition dans /historique/[id], les blocs cardio ont les champs durée, calories, RPE éditables. Mais le type_cardio (vélo, course, etc.) est probablement affiché en texte fixe — pas de select pour le changer.

## FICHIER : `app/historique/[id]/page.js`

### Solution : Remplacer le texte du type par un select en mode édition

**Mode lecture (inchangé) :**
```
🚴 Vélo · 20 min · 120 kcal · RPE 7
```

**Mode édition :**
```
[Vélo ▼] · [20] min · [120] kcal · RPE [7]  [×]
```

Le type_cardio devient un `<select>` :

```jsx
{isEditing ? (
  <select
    value={bloc.type_cardio}
    onChange={(e) => updateCardio(bloc.id, 'type_cardio', e.target.value)}
    style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 6,
      color: '#f0f0f0',
      fontSize: 16, // anti-zoom iOS
      padding: '6px 8px',
    }}
  >
    {CARDIO_TYPES.map(ct => (
      <option key={ct.value} value={ct.value}>{ct.label}</option>
    ))}
  </select>
) : (
  <span>{getCardioEmoji(bloc.type_cardio)} {bloc.type_cardio}</span>
)}
```

**Options du select :**
```js
const CARDIO_TYPES = [
  { value: 'course', label: '🏃 Course' },
  { value: 'velo', label: '🚴 Vélo' },
  { value: 'elliptique', label: '🔄 Elliptique' },
  { value: 'tapis', label: '🏃 Tapis' },
  { value: 'stepper', label: '⬆️ Stepper' },
  { value: 'spinning', label: '🚴 Spinning' },
  { value: 'rameur', label: '🚣 Rameur' },
  { value: 'corde', label: '🪢 Corde à sauter' },
];
```

**Sauvegarde au onChange :**
```js
// La fonction updateCardio existe déjà — elle gère l'UPDATE Supabase
// Le type_cardio est juste un nouveau champ pris en charge
async function updateCardio(blocId, field, value) {
  const { error } = await supabase
    .from('cardio_blocs')
    .update({ [field]: value })
    .eq('id', blocId);

  if (!error) {
    // Optimistic update état local
    setSeance(prev => ({
      ...prev,
      cardio_blocs: prev.cardio_blocs.map(b =>
        b.id === blocId ? { ...b, [field]: value } : b
      )
    }));
  }
}
```

---

# CORRECTION 3 — Réordonnement des exercices en mode édition

## PROBLÈME
L'ordre des exercices dans une séance est défini par le champ `series.ordre`. Si le parsing NLP a mis les exercices dans le mauvais ordre, ou si l'utilisateur veut réorganiser, il n'y a pas de moyen de le faire.

## FICHIER : `app/historique/[id]/page.js`

### Solution : Boutons ↑↓ sur chaque bloc exercice en mode édition

**Mode édition :**
```
[↑] [↓]  💪 Pompes                    [🔄 Changer]
            Série 1 : [20] reps  [×]
            Série 2 : [20] reps  [×]

[↑] [↓]  💪 Tractions                 [🔄 Changer]
            Série 1 : [8] reps   [×]

[↑] [↓]  💪 Développé couché          [🔄 Changer]
            Série 1 : [10] × [60] kg  [×]
```

**Bouton ↑ :** déplace le bloc exercice vers le haut (échange d'ordre avec le bloc précédent)
**Bouton ↓ :** déplace le bloc exercice vers le bas (échange d'ordre avec le bloc suivant)
**Premier exercice :** ↑ désactivé (grisé)
**Dernier exercice :** ↓ désactivé (grisé)

### Implémentation

Les exercices sont groupés par exercice_id dans l'affichage. Chaque groupe a un `ordre` (le champ `series.ordre`).

```js
// Regrouper les séries par exercice_id, ordonné par 'ordre'
function getExerciceBlocs(series) {
  const blocs = [];
  const seen = new Set();

  // Trier par ordre puis num_serie
  const sorted = [...series].sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || a.num_serie - b.num_serie);

  for (const s of sorted) {
    if (!seen.has(s.exercice_id)) {
      seen.add(s.exercice_id);
      blocs.push({
        exercice_id: s.exercice_id,
        exercice: s.exercices,
        ordre: s.ordre || 0,
        series: sorted.filter(x => x.exercice_id === s.exercice_id),
      });
    }
  }

  return blocs;
}
```

**Échange d'ordre :**
```js
async function handleMoveExercice(exerciceId, direction) {
  // direction = -1 (monter) ou +1 (descendre)
  const blocs = getExerciceBlocs(seance.series);
  const currentIndex = blocs.findIndex(b => b.exercice_id === exerciceId);
  const targetIndex = currentIndex + direction;

  if (targetIndex < 0 || targetIndex >= blocs.length) return;

  const currentBloc = blocs[currentIndex];
  const targetBloc = blocs[targetIndex];

  // Échanger les ordres en DB
  // UPDATE toutes les séries du bloc courant → ordre du target
  // UPDATE toutes les séries du bloc target → ordre du courant
  const currentOrdre = currentBloc.ordre;
  const targetOrdre = targetBloc.ordre;

  // Si les ordres sont identiques (0,0), les différencier d'abord
  const newCurrentOrdre = targetOrdre;
  const newTargetOrdre = currentOrdre;

  // Batch update
  await Promise.all([
    supabase
      .from('series')
      .update({ ordre: newCurrentOrdre })
      .eq('seance_id', seance.id)
      .eq('exercice_id', currentBloc.exercice_id),
    supabase
      .from('series')
      .update({ ordre: newTargetOrdre })
      .eq('seance_id', seance.id)
      .eq('exercice_id', targetBloc.exercice_id),
  ]);

  // Optimistic update : échanger dans l'état local
  setSeance(prev => ({
    ...prev,
    series: prev.series.map(s => {
      if (s.exercice_id === currentBloc.exercice_id) return { ...s, ordre: newCurrentOrdre };
      if (s.exercice_id === targetBloc.exercice_id) return { ...s, ordre: newTargetOrdre };
      return s;
    })
  }));
}
```

**⚠️ Cas où tous les ordres sont à 0 :**
Si les séries ont toutes `ordre = 0` (cas fréquent pour les anciennes séances), il faut d'abord les numéroter avant de pouvoir échanger :

```js
// Avant le premier déplacement, normaliser les ordres si nécessaire
async function normalizeOrdres() {
  const blocs = getExerciceBlocs(seance.series);
  const allSameOrdre = blocs.every(b => b.ordre === blocs[0].ordre);

  if (allSameOrdre && blocs.length > 1) {
    // Numéroter séquentiellement
    for (let i = 0; i < blocs.length; i++) {
      await supabase
        .from('series')
        .update({ ordre: i })
        .eq('seance_id', seance.id)
        .eq('exercice_id', blocs[i].exercice_id);
    }

    // Mettre à jour l'état local
    setSeance(prev => ({
      ...prev,
      series: prev.series.map(s => {
        const blocIndex = blocs.findIndex(b => b.exercice_id === s.exercice_id);
        return { ...s, ordre: blocIndex };
      })
    }));
  }
}
```

Appeler `normalizeOrdres()` au premier clic sur ↑ ou ↓.

**Design boutons ↑↓ :**
- Petits boutons carrés 32×32px, zone de tap 44×44px
- Fond transparent, border fine muted, texte muted
- Hover/tap : border orange, texte orange
- Désactivé : opacity 0.3, cursor default
- Positionnés à gauche du nom de l'exercice

**Aussi pour les blocs cardio :**
Les blocs cardio ont un champ `ordre`. Même principe : boutons ↑↓ pour réordonner les blocs cardio entre eux.

```js
async function handleMoveCardio(blocId, direction) {
  const sorted = [...seance.cardio_blocs].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const currentIndex = sorted.findIndex(b => b.id === blocId);
  const targetIndex = currentIndex + direction;

  if (targetIndex < 0 || targetIndex >= sorted.length) return;

  const currentBloc = sorted[currentIndex];
  const targetBloc = sorted[targetIndex];

  await Promise.all([
    supabase.from('cardio_blocs').update({ ordre: targetBloc.ordre }).eq('id', currentBloc.id),
    supabase.from('cardio_blocs').update({ ordre: currentBloc.ordre }).eq('id', targetBloc.id),
  ]);

  setSeance(prev => ({
    ...prev,
    cardio_blocs: prev.cardio_blocs.map(b => {
      if (b.id === currentBloc.id) return { ...b, ordre: targetBloc.ordre };
      if (b.id === targetBloc.id) return { ...b, ordre: currentBloc.ordre };
      return b;
    })
  }));
}
```

---

## NE PAS TOUCHER

- ❌ /api/parse-seance, /api/coaching (sauf ajout notes dans prompt after — déjà fait)
- ❌ Mode NLP (flow parsing, validation, multi-passes)
- ❌ Mode manuel (formulaire séries/cardio)
- ❌ Templates (CRUD, checklist)
- ❌ Schéma DB (aucun ALTER TABLE)
- ❌ Dashboard, Stats, Profil

---

## TEST AVANT COMMIT

### Correction 1 — Contexte manuel :
1. Page /seance → toggle Maison/Salle visible au-dessus du toggle NLP/Manuel
2. Sélectionner "Salle" → démarrer en mode manuel → enregistrer un exercice
3. Vérifier en DB : seances.contexte = 'salle' (pas 'maison')
4. Lancer un template avec contexte 'maison' → le sélecteur reflète 'maison'
5. Séance en cours → le sélecteur est désactivé (lecture seule)
6. Restauration localStorage → le sélecteur reflète le contexte de la séance

### Correction 2 — Type cardio éditable :
7. Mode édition /historique/[id] → le type cardio est un select (pas du texte)
8. Changer "vélo" → "course" → vérifier UPDATE en DB
9. Mode lecture → le type s'affiche normalement avec le bon emoji

### Correction 3 — Réordonnement :
10. Mode édition → boutons ↑↓ visibles sur chaque bloc exercice
11. Premier exercice → ↑ désactivé
12. Dernier exercice → ↓ désactivé
13. Cliquer ↓ sur le premier exercice → il passe en 2e position
14. Vérifier en DB : les ordres ont été échangés
15. Même test pour les blocs cardio
16. Séance ancienne (tous ordres à 0) → premier clic normalise → puis échange fonctionne
17. Responsive 375px → boutons ↑↓ touchables, pas de chevauchement

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Sélecteur contexte mode manuel + type cardio éditable + réordonnement exercices et cardio (↑↓)"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Corrections mineures
- Sélecteur contexte Maison/Salle sur /seance (toggle persistant, utilisé par ensureSeance, désactivé en séance active)
- Type cardio éditable en mode édition (select avec 8 types + emojis)
- Réordonnement exercices en mode édition (boutons ↑↓, échange d'ordre en DB, normalisation ordres si tous à 0)
- Réordonnement cardio blocs en mode édition (même principe)
```