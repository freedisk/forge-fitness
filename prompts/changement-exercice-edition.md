# AMÉLIORATION — Changement d'exercice en mode édition séance

## CONTEXTE
FORGE en production. Le mode édition sur /historique/[id] permet de modifier reps, poids, supprimer/ajouter séries et cardio. Mais on ne peut PAS changer l'exercice associé à un bloc de séries. Si le parsing NLP a assigné le mauvais exercice, il faut supprimer et recréer — pas acceptable.

## CE QUE TU DOIS FAIRE

Ajouter la possibilité de changer l'exercice d'un bloc de séries en mode édition sur `app/historique/[id]/page.js`.

---

## SCHÉMA DB — RAPPEL

```
series : id, seance_id, exercice_id, ordre, num_serie, repetitions, poids_kg, notes
exercices : id, nom, categorie, groupe_musculaire, type, is_custom, source, user_id
```

⚠️ Noms DB : `categorie` et `groupe_musculaire` SANS accents, avec UNDERSCORES.

---

## FLOW UTILISATEUR

### En mode édition, le nom de l'exercice devient cliquable :

**Mode lecture (inchangé) :**
```
💪 Développé couché
  Série 1 : 10 reps × 60 kg
  Série 2 : 10 reps × 60 kg
```

**Mode édition :**
```
💪 Développé couché  [✏️ Changer]     ← bouton ou nom cliquable
  Série 1 : [10] reps × [60] kg  [×]
  Série 2 : [10] reps × [60] kg  [×]
```

**Au clic sur le nom ou le bouton "Changer" → panneau sélecteur :**
```
┌─────────────────────────────────────────┐
│  🔄 Changer l'exercice                  │
│  Actuellement : Développé couché        │
│                                         │
│  [Tous] [Pecs] [Dos] [Épaules] ...     │  ← Pills filtre groupe
│                                         │
│  🔍 Rechercher...                       │  ← Recherche texte
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Développé incliné    Barre     │    │
│  │  Développé décliné    Barre     │    │
│  │  Pompes diamant    Poids corps  │    │
│  │  ...                            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Pas trouvé ? [+ Créer un exercice]     │  ← Auto-learning manuel
│                                         │
│  [Annuler]                              │
└─────────────────────────────────────────┘
```

---

## IMPLÉMENTATION

### 1. State pour le sélecteur

```js
const [changingExerciceFor, setChangingExerciceFor] = useState(null);
// null = sélecteur fermé
// { oldExerciceId, oldExerciceNom } = sélecteur ouvert pour ce bloc
```

### 2. Chargement du catalogue

```js
// Charger le catalogue une seule fois au montage (ou au premier clic)
const [catalogueExercices, setCatalogueExercices] = useState([]);

async function loadCatalogue() {
  if (catalogueExercices.length > 0) return; // déjà chargé
  const { data } = await supabase
    .from('exercices')
    .select('*')
    .or('user_id.is.null,user_id.eq.' + user.id)
    .order('nom');
  if (data) setCatalogueExercices(data);
}
```

### 3. Filtres et recherche

Même logique que le mode manuel sur /seance et que la page /exercices :

```js
const [groupeFilter, setGroupeFilter] = useState('tous');
const [searchText, setSearchText] = useState('');

// Fonction de suppression d'accents pour la recherche
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const filteredCatalogue = catalogueExercices.filter(ex => {
  // Filtre groupe
  if (groupeFilter === 'cardio') {
    if (ex.categorie !== 'cardio') return false;
  } else if (groupeFilter !== 'tous') {
    if (ex.groupe_musculaire !== groupeFilter) return false;
  }
  // Filtre recherche
  if (searchText) {
    const search = removeAccents(searchText.toLowerCase());
    const nom = removeAccents(ex.nom.toLowerCase());
    if (!nom.includes(search)) return false;
  }
  // Exclure l'exercice actuel (pas utile de le voir dans la liste)
  if (ex.id === changingExerciceFor?.oldExerciceId) return false;
  return true;
});
```

**Pills groupes :**
```
Tous · Pecs · Dos · Épaules · Biceps · Triceps · Jambes · Abdos · Cardio
```
- Filtrent sur `groupe_musculaire` (sauf Cardio → `categorie = 'cardio'`)
- Style identique aux pills existantes dans l'app

### 4. Sélection d'un exercice existant → UPDATE

Quand l'utilisateur tape sur un exercice dans la liste :

```js
async function handleChangeExercice(newExerciceId, newExercice) {
  const oldExerciceId = changingExerciceFor.oldExerciceId;
  const seanceId = seance.id;

  // UPDATE toutes les séries de ce bloc (même exercice dans la même séance)
  const { error } = await supabase
    .from('series')
    .update({ exercice_id: newExerciceId })
    .eq('seance_id', seanceId)
    .eq('exercice_id', oldExerciceId);

  if (!error) {
    // Optimistic update : mettre à jour l'état local
    setSeance(prev => ({
      ...prev,
      series: prev.series.map(s =>
        s.exercice_id === oldExerciceId
          ? { ...s, exercice_id: newExerciceId, exercices: newExercice }
          : s
      )
    }));
    // Toast succès
    // Fermer le sélecteur
    setChangingExerciceFor(null);
    setGroupeFilter('tous');
    setSearchText('');
  } else {
    console.error('Erreur changement exercice:', error);
    // Toast erreur
  }
}
```

### 5. Création d'un exercice (auto-learning manuel)

Si l'exercice voulu n'existe pas dans le catalogue, bouton "+ Créer un exercice" en bas de la liste :

```
┌─────────────────────────────────────────┐
│  + Créer un exercice                    │
│                                         │
│  Nom :      [                    ]      │
│  Catégorie : [Musculation ▼]            │
│  Groupe :    [Pecs ▼]                   │
│  Type :      [Barre ▼]                  │
│                                         │
│  [✅ Créer et utiliser]    [Annuler]    │
└─────────────────────────────────────────┘
```

```js
const [isCreating, setIsCreating] = useState(false);
const [newExo, setNewExo] = useState({
  nom: '',
  categorie: 'musculation',
  groupe_musculaire: 'pecs',
  type: 'barre',
});

async function handleCreateAndUse() {
  if (!newExo.nom.trim()) return;

  // Normaliser les valeurs pour la DB
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
    // Ajouter au catalogue local
    setCatalogueExercices(prev => [...prev, created]);
    // Utiliser comme remplacement
    await handleChangeExercice(created.id, created);
    // Reset formulaire
    setIsCreating(false);
    setNewExo({ nom: '', categorie: 'musculation', groupe_musculaire: 'pecs', type: 'barre' });
  }
}
```

**Selects pour la création :**

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

⚠️ **Les values sont les identifiants DB** : sans accents, avec underscores. Les labels sont lisibles.

---

## DESIGN

**Bouton "Changer" sur le nom de l'exercice :**
- En mode édition uniquement
- Petit bouton ✏️ ou icône 🔄 à côté du nom, couleur muted
- Au tap → le nom passe en highlight orange + le sélecteur s'ouvre en dessous

**Panneau sélecteur :**
- S'ouvre inline (sous le bloc exercice), pas en modale — mobile-first
- Fond rgba(255,255,255,0.04), border rgba(255,255,255,0.12), border-radius 10px
- Max-height 350px, overflow-y auto pour la liste
- Pills groupes : scrollable horizontalement, même style que partout
- Input recherche : fond surface, font-size 16px (anti-zoom iOS)
- Chaque exercice dans la liste : padding 12px, border-bottom fine, tap → sélection
- Exercice actuel exclu de la liste (pas de confusion)

**Formulaire création :**
- S'affiche à la place de la liste quand on tape "+ Créer un exercice"
- Inputs : font-size 16px, fond surface, selects natifs
- Bouton "✅ Créer et utiliser" : gradient forge
- Bouton "Annuler" : ghost

**Un seul sélecteur ouvert à la fois :**
- Si on clique "Changer" sur un autre exercice → fermer le précédent

---

## NE PAS TOUCHER

- ❌ /api/parse-seance, /api/coaching
- ❌ Mode lecture de /historique/[id] (doit rester identique)
- ❌ Édition des reps/poids (déjà en place, ne pas casser)
- ❌ Ajout exercices NLP/Manuel (déjà en place)
- ❌ Schéma DB
- ❌ Autres pages

---

## TEST AVANT COMMIT

1. Ouvrir /historique/[id] en mode lecture → nom exercice NON cliquable (pas de régression)
2. Passer en mode édition → bouton "Changer" visible à côté de chaque nom d'exercice
3. Cliquer "Changer" → sélecteur s'ouvre inline avec pills et recherche
4. Filtrer par groupe → liste filtrée
5. Rechercher par texte → filtrage instantané (insensible accents/casse)
6. Sélectionner un exercice existant → UPDATE → nom change → séries intactes
7. Vérifier en DB : toutes les séries du bloc ont le nouveau exercice_id
8. Cliquer "Changer" sur un autre bloc → le précédent sélecteur se ferme
9. Ouvrir "Créer un exercice" → remplir le formulaire → créer → exercice assigné
10. Vérifier en DB : nouvel exercice (source='manuel', is_custom=true, user_id)
11. Annuler la création → retour à la liste
12. Annuler le changement → sélecteur se ferme, rien ne change
13. Responsive 375px → sélecteur scrollable, inputs touchables
14. Quitter le mode édition → retour en lecture, tout correct

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Changement d'exercice en mode édition : sélecteur catalogue + création manuelle (auto-learning)"
git push
```

**Mise à jour CLAUDE.md — Ajouter dans "Édition séance historique" :**
```
- Changement d'exercice : bouton "Changer" sur chaque bloc en mode édition → sélecteur catalogue inline (pills groupes + recherche)
- UPDATE toutes les séries du bloc vers le nouvel exercice_id
- Création d'exercice à la volée si non trouvé (source='manuel', is_custom=true) — auto-learning
- Un seul sélecteur ouvert à la fois
```