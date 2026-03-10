# AMÉLIORATION — Édition catalogue exercices perso + Notes de séance

## CONTEXTE
FORGE en production. Deux trous fonctionnels identifiés :
1. Les exercices personnels (source='ia_infere' ou 'manuel') ne sont pas éditables/supprimables dans le catalogue — le CDC le promettait
2. Le champ `seances.notes` existe en DB mais n'est exposé nulle part dans l'UI

---

## SCHÉMA DB — RAPPEL

```
exercices : id, nom, categorie, groupe_musculaire, type, is_custom, source, user_id
  → source : 'catalogue' (global, user_id NULL) | 'ia_infere' (auto-learning) | 'manuel' (créé par l'utilisateur)
  → is_custom : true si créé par l'utilisateur ou l'IA

seances : id, ..., notes TEXT, ...
  → notes existe déjà, DEFAULT NULL, jamais utilisé dans l'UI
```

⚠️ Noms DB : `categorie` et `groupe_musculaire` SANS accents, avec UNDERSCORES.

---

# PARTIE 1 — Édition catalogue exercices personnels

## MODIFIER : `app/exercices/page.js`

### Ce qui existe actuellement :
- Liste des exercices avec filtres par groupe musculaire (pills)
- Badges source : aucun (catalogue), 🧠 violet (ia_infere), ✏️ bleu (manuel)
- Compteur d'exercices
- Lecture seule

### Ce qu'il faut ajouter :

**Boutons d'action sur les exercices personnels uniquement :**

```
Exercice global (catalogue) :
┌─────────────────────────────────────┐
│  Développé couché    Barre   Pecs   │  ← pas de boutons, lecture seule
└─────────────────────────────────────┘

Exercice perso (ia_infere ou manuel) :
┌─────────────────────────────────────┐
│  Goblet squat 🧠   Haltères  Jambes │
│                      [✏️] [🗑️]     │  ← boutons éditer + supprimer
└─────────────────────────────────────┘
```

**Règle :** seuls les exercices avec `user_id = auth.uid()` (is_custom = true) sont éditables/supprimables. Les exercices du catalogue global (user_id NULL) sont intouchables.

---

### Édition d'un exercice perso

Au clic sur ✏️ → le contenu de la card passe en mode édition inline (pas de modale) :

```
┌─────────────────────────────────────────┐
│  Nom :       [Goblet squat          ]   │
│  Catégorie : [Musculation ▼]            │
│  Groupe :    [Jambes ▼]                 │
│  Type :      [Haltères ▼]              │
│                                         │
│  [✅ Enregistrer]  [Annuler]            │
└─────────────────────────────────────────┘
```

```js
const [editingExercice, setEditingExercice] = useState(null);
// null = pas en édition
// { id, nom, categorie, groupe_musculaire, type } = exercice en cours d'édition

async function handleSaveExercice() {
  // Normaliser les valeurs pour la DB
  const normalizedCategorie = removeAccents(editingExercice.categorie.toLowerCase()).replace(/\s+/g, '_');
  const normalizedGroupe = removeAccents(editingExercice.groupe_musculaire.toLowerCase()).replace(/\s+/g, '_');

  const { error } = await supabase
    .from('exercices')
    .update({
      nom: editingExercice.nom.trim(),
      categorie: normalizedCategorie,
      groupe_musculaire: normalizedGroupe,
      type: editingExercice.type,
    })
    .eq('id', editingExercice.id);

  if (!error) {
    // Optimistic update : mettre à jour dans la liste locale
    setExercices(prev => prev.map(ex =>
      ex.id === editingExercice.id
        ? { ...ex, nom: editingExercice.nom.trim(), categorie: normalizedCategorie, groupe_musculaire: normalizedGroupe, type: editingExercice.type }
        : ex
    ));
    setEditingExercice(null);
    // Toast succès "Exercice modifié ✅"
  } else {
    console.error('Erreur update exercice:', error);
    // Toast erreur
  }
}
```

**Selects avec les mêmes options que le formulaire de création :**

```js
const CATEGORIES = [
  { value: 'musculation', label: 'Musculation' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobilite', label: 'Mobilité' },
  { value: 'autres', label: 'Autres' },
];

const GROUPES = [
  { value: 'pecs', label: 'Pecs' },
  { value: 'dos', label: 'Dos' },
  { value: 'epaules', label: 'Épaules' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'jambes', label: 'Jambes' },
  { value: 'abdos', label: 'Abdos' },
  { value: 'full_body', label: 'Full body' },
];

const TYPES = [
  { value: 'barre', label: 'Barre' },
  { value: 'halteres', label: 'Haltères' },
  { value: 'machine', label: 'Machine' },
  { value: 'poids_corps', label: 'Poids du corps' },
  { value: 'cardio', label: 'Cardio' },
];
```

⚠️ Les values sont les identifiants DB (sans accents, underscores). Les labels sont lisibles.

**Pour le select d'édition :** pré-remplir avec la valeur actuelle de l'exercice. Si la valeur en DB ne matche pas exactement une option (cas improbable mais possible) → sélectionner "Autres" par défaut.

---

### Suppression d'un exercice perso

Au clic sur 🗑️ → confirmation avec avertissement :

```js
async function handleDeleteExercice(exercice) {
  // Vérifier si l'exercice est utilisé dans des séries
  const { count } = await supabase
    .from('series')
    .select('id', { count: 'exact', head: true })
    .eq('exercice_id', exercice.id);

  let confirmMessage;
  if (count > 0) {
    confirmMessage = `Supprimer "${exercice.nom}" ?\n\n⚠️ Cet exercice est utilisé dans ${count} série(s). Les séries associées seront également supprimées (données perdues).\n\nCette action est irréversible.`;
  } else {
    confirmMessage = `Supprimer "${exercice.nom}" ?\n\nCet exercice n'est utilisé dans aucune séance.`;
  }

  if (!confirm(confirmMessage)) return;

  const { error } = await supabase
    .from('exercices')
    .delete()
    .eq('id', exercice.id);

  if (!error) {
    setExercices(prev => prev.filter(ex => ex.id !== exercice.id));
    // Toast succès "Exercice supprimé"
  } else {
    console.error('Erreur suppression exercice:', error);
    // Toast erreur
  }
}
```

**⚠️ CASCADE :** La FK `series.exercice_id → exercices(id) ON DELETE CASCADE` supprimera automatiquement toutes les séries liées. C'est destructif — d'où l'avertissement avec le compteur.

---

### Création d'exercice depuis le catalogue

Ajouter un bouton "+ Créer un exercice" en haut de la page (à côté du compteur) :

```
📋 Catalogue (67 exercices)                [+ Créer un exercice]
```

Au clic → formulaire inline en haut de la liste (même formulaire que l'édition) :

```js
const [isCreating, setIsCreating] = useState(false);
const [newExo, setNewExo] = useState({
  nom: '',
  categorie: 'musculation',
  groupe_musculaire: 'pecs',
  type: 'barre',
});

async function handleCreateExercice() {
  if (!newExo.nom.trim()) return;

  const normalizedCategorie = removeAccents(newExo.categorie.toLowerCase()).replace(/\s+/g, '_');
  const normalizedGroupe = removeAccents(newExo.groupe_musculaire.toLowerCase()).replace(/\s+/g, '_');

  const { data: created, error } = await supabase
    .from('exercices')
    .insert({
      nom: newExo.nom.trim(),
      categorie: normalizedCategorie,
      groupe_musculaire: normalizedGroupe,
      type: newExo.type,
      is_custom: true,
      source: 'manuel',
      user_id: user.id,
    })
    .select()
    .single();

  if (created) {
    setExercices(prev => [...prev, created].sort((a, b) => a.nom.localeCompare(b.nom)));
    setIsCreating(false);
    setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' });
    // Toast succès "Exercice créé ✅"
  }
}
```

---

# PARTIE 2 — Notes de séance

## Exposer le champ `seances.notes` dans l'UI

### A. MODIFIER : `app/seance/page.js` — Saisie dans l'écran bilan

Ajouter un champ notes **en bas de l'écran bilan** (état finishing), après le RPE :

```
┌─────────────────────────────────────────┐
│  📊 Bilan de la séance                  │
│                                         │
│  💪 186 reps · 🏋️ 4.3t soulevés        │
│                                         │
│  ⏱️ Durée     [45] min                  │
│  🔥 Calories  [   ]                     │
│  💪 RPE       1 2 3 4 5 6 7 8 9 10     │
│                                         │
│  📝 Notes (optionnel)                   │
│  ┌─────────────────────────────────┐    │
│  │ Douleur épaule droite, salle   │    │  ← textarea, 2-3 lignes
│  │ bondée, bonne énergie          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [✅ Valider le bilan]                  │
│  Passer →                               │
└─────────────────────────────────────────┘
```

**Implémentation :**
```js
const [notesInput, setNotesInput] = useState('');

// Dans le handler "Valider le bilan" existant, ajouter notes :
await supabase
  .from('seances')
  .update({
    duree_totale: dureeInput || dureeAuto,
    calories_totales: caloriesInput || null,
    rpe: selectedRpe || null,
    notes: notesInput.trim() || null,  // AJOUTER
  })
  .eq('id', activeSeanceId);
```

**Style textarea :**
- 2-3 lignes par défaut (rows=2)
- Fond rgba(255,255,255,0.06), border rgba(255,255,255,0.1), border-radius 8px
- Placeholder : "Ressenti, conditions, remarques..."
- font-size 16px (anti-zoom iOS)
- Optionnel — peut rester vide

**Aussi inclure dans le coaching after :**
```js
// Dans le payload coaching after, ajouter :
seance_actuelle: {
  // ... existant
  notes: notesInput.trim() || null,  // AJOUTER
}
```

Et dans `/api/coaching/route.js`, si notes est fourni :
```js
if (seanceActuelle.notes) {
  promptParts.push(`Notes de l'utilisateur : "${seanceActuelle.notes}"`);
}
```

---

### B. MODIFIER : `app/historique/[id]/page.js` — Affichage + édition

**Mode lecture — Afficher les notes si présentes :**

Après le header (date, contexte, durée, calories, RPE, volume), avant les exercices :

```
📝 "Douleur épaule droite, salle bondée, bonne énergie"
```

- Style : fond rgba(255,255,255,0.03), border-left 3px #777, padding 10px, font-style italic, color #aaa
- N'afficher que si notes est non null/non vide
- Avant les blocs cardio et exercices

**Mode édition — Textarea éditable :**

```
📝 Notes
┌─────────────────────────────────────────┐
│ Douleur épaule droite, salle bondée,   │
│ bonne énergie                          │
└─────────────────────────────────────────┘
```

```js
// Afficher un textarea pré-rempli en mode édition
const [notesEdit, setNotesEdit] = useState(seance.notes || '');

// Sauvegarde onBlur
async function handleNotesBlur() {
  const newNotes = notesEdit.trim() || null;
  if (newNotes === seance.notes) return; // pas de changement

  await supabase
    .from('seances')
    .update({ notes: newNotes })
    .eq('id', seance.id);

  setSeance(prev => ({ ...prev, notes: newNotes }));
}
```

---

### C. MODIFIER : `app/historique/page.js` — Notes sur les cards (discret)

Si une séance a des notes, afficher un indicateur discret sur la card :

```
┌─────────────────────────────────────────┐
│  📅 9 mars · 🏠 Maison · 45 min        │
│  💪 Pompes, Tractions, Développé couché │
│  186 reps · 4.3t                        │
│  📝 "Douleur épaule droite..."          │  ← aperçu notes (tronqué 50 chars)
└─────────────────────────────────────────┘
```

- Texte tronqué à ~50 caractères + "..."
- Style : italic, color #777, font-size 11px
- N'afficher que si notes est non null/non vide
- Pas de chargement supplémentaire — notes est déjà dans le SELECT seances

---

## DESIGN GLOBAL

**Exercices catalogue :**
- Boutons ✏️ et 🗑️ : petits (24px icône), zone de tap 44×44px, alignés à droite
- ✏️ : couleur muted, hover bleu
- 🗑️ : couleur muted, hover rouge
- Formulaire édition inline : même fond que la card, border orange pointillé pour distinguer
- Formulaire création : en haut de la liste, fond surface, border orange

**Notes :**
- Textarea : style cohérent avec les autres inputs FORGE (fond surface, border fine)
- Affichage lecture : italic, muted, border-left comme les citations
- Tout est optionnel — ne rien afficher si vide

---

## NE PAS TOUCHER

- ❌ /api/parse-seance (la logique auto-learning reste identique)
- ❌ Mode NLP, mode manuel sur /seance (seuls le bilan et le coaching after sont modifiés)
- ❌ Schéma DB (le champ notes existe déjà, aucun ALTER TABLE)
- ❌ Dashboard Home, Stats, Templates, Profil

---

## TEST AVANT COMMIT

### Catalogue exercices :
1. Page /exercices → vérifier que les exercices globaux n'ont PAS de boutons ✏️🗑️
2. Exercice 🧠 (ia_infere) → boutons ✏️🗑️ visibles
3. Cliquer ✏️ → formulaire inline pré-rempli → modifier le nom → Enregistrer → nom mis à jour
4. Modifier la catégorie et le groupe → vérifier normalisation en DB (sans accents, underscores)
5. Annuler → retour à l'affichage normal, aucune modification
6. Cliquer 🗑️ sur un exercice NON utilisé → confirmation simple → supprimé
7. Cliquer 🗑️ sur un exercice utilisé dans des séries → avertissement avec compteur → confirmer → supprimé (CASCADE)
8. Bouton "+ Créer un exercice" → formulaire → créer → apparaît dans la liste avec badge ✏️
9. Responsive 375px → boutons touchables, formulaire scrollable

### Notes de séance :
10. Démarrer et terminer une séance → écran bilan → saisir des notes → valider
11. Vérifier en DB : seances.notes rempli
12. Coaching after → vérifier que les notes sont mentionnées dans l'analyse
13. Historique /historique/[id] → notes affichées en italic sous le header
14. Mode édition → notes dans textarea → modifier → onBlur → UPDATE
15. Liste /historique → aperçu notes tronqué visible sur la card
16. Séance sans notes → aucun bloc notes affiché (pas de section vide)

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Édition catalogue exercices perso (modifier/supprimer/créer) + notes de séance (saisie bilan, affichage historique, coaching)"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Catalogue exercices
- Exercices perso (is_custom=true) éditables : nom, catégorie, groupe musculaire, type (inline, normalisation DB)
- Suppression exercice perso avec avertissement CASCADE (compteur séries liées)
- Création exercice depuis la page catalogue (source='manuel')
- Exercices globaux (catalogue) : lecture seule, intouchables

## Notes de séance
- Champ seances.notes exposé dans l'UI (existait déjà en DB)
- Saisie dans l'écran bilan fin de séance (textarea optionnel)
- Coaching after enrichi avec les notes utilisateur
- Affichage dans détail historique (mode lecture : italic, mode édition : textarea onBlur)
- Aperçu tronqué sur les cards liste historique
```