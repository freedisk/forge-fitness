# AMÉLIORATION — Dernière performance étendue + Suppression rapide historique

## CONTEXTE
FORGE complet, testé en conditions réelles.
La "dernière performance" s'affiche déjà dans le mode manuel (formulaire séries).
Deux ajouts demandés :
1. Étendre la dernière performance à la checklist template
2. Supprimer une séance directement depuis la liste /historique (sans ouvrir le détail)

---

## 1. DERNIÈRE PERFORMANCE — Checklist template

### Fichier : `app/seance/page.js`

Quand une séance est lancée depuis un template, les exercices s'affichent en checklist guidée. Chaque exercice a un bouton "Loguer" qui ouvre un mini-formulaire inline.

**Ajouter sous le nom de chaque exercice dans la checklist :**

```
┌─────────────────────────────────────────┐
│  💪 Développé couché                    │
│  Dernière fois : 3×10 × 60kg — il y a 3j│  ← NOUVEAU
│                                         │
│  [Loguer]                               │
└─────────────────────────────────────────┘
```

**Comment :**
- Au chargement de la checklist template, pour chaque exercice, charger la dernière performance
- Réutiliser la même logique que le mode manuel (fonction `getLastPerformance` ou équivalente)
- Afficher le résumé en texte muted italic 12px, sous le nom de l'exercice
- Si aucune performance passée → "Première fois 💪"

**Pré-remplissage du formulaire Loguer :**
- Quand l'utilisateur tape "Loguer" sur un exercice du template, le mini-formulaire séries devrait aussi être pré-rempli avec la dernière performance (même nombre de séries, mêmes reps/poids)
- Si la dernière perf existe → pré-remplir
- Sinon → 3 séries vides par défaut (comportement actuel)

**Batch loading (performance) :**
```js
// Charger les dernières perfs pour TOUS les exercices du template en une seule requête
// plutôt qu'une requête par exercice

async function getLastPerformanceBatch(exerciceIds) {
  if (exerciceIds.length === 0) return {};

  const { data } = await supabase
    .from('series')
    .select('exercice_id, num_serie, repetitions, poids_kg, seances!inner(date)')
    .in('exercice_id', exerciceIds)
    .order('seances(date)', { ascending: false });

  if (!data) return {};

  // Grouper par exercice_id → prendre la date la plus récente pour chacun
  const result = {};
  for (const s of data) {
    const exoId = s.exercice_id;
    if (!result[exoId]) {
      result[exoId] = { date: s.seances.date, series: [] };
    }
    // Ne garder que les séries de la date la plus récente
    if (s.seances.date === result[exoId].date) {
      result[exoId].series.push(s);
    }
  }

  // Trier les séries par num_serie
  for (const exoId of Object.keys(result)) {
    result[exoId].series.sort((a, b) => a.num_serie - b.num_serie);
  }

  return result;
}
```

**Appel au montage de la checklist template :**
```js
// Quand le template est chargé et la checklist affichée
const exerciceIds = templateExercices.map(te => te.exercice_id);
const lastPerfs = await getLastPerformanceBatch(exerciceIds);
setLastPerformances(lastPerfs);
```

**Formatage (réutiliser la même fonction que le mode manuel) :**
```js
function formatLastPerformance(lastPerf, unite) {
  if (!lastPerf) return "Première fois 💪";

  const { series, date } = lastPerf;
  const daysAgo = Math.floor((new Date() - new Date(date)) / 86400000);
  const daysLabel = daysAgo === 0 ? "aujourd'hui"
    : daysAgo === 1 ? "hier"
    : `il y a ${daysAgo}j`;

  const allSameReps = series.every(s => s.repetitions === series[0].repetitions);
  const poids = series[0]?.poids_kg;

  if (allSameReps && poids != null) {
    return `${series.length}×${series[0].repetitions} × ${toDisplay(poids, unite)}${unitLabel(unite)} — ${daysLabel}`;
  } else if (allSameReps) {
    return `${series.length}×${series[0].repetitions} reps — ${daysLabel}`;
  } else {
    const repsStr = series.map(s => s.repetitions).join(', ');
    const poidsStr = poids != null ? ` × ${toDisplay(poids, unite)}${unitLabel(unite)}` : '';
    return `${series.length} séries : ${repsStr}${poidsStr} — ${daysLabel}`;
  }
}
```

**Si cette fonction existe déjà dans le code du mode manuel** → la réutiliser telle quelle, pas la dupliquer.

**Style :**
- Texte : color #777, font-size 12px, font-style italic
- Fond : rgba(255,255,255,0.03), border-left 3px #3b82f6, padding 8px 10px, margin 4px 0 8px 0
- Même style que dans le mode manuel

---

## 2. SUPPRESSION RAPIDE DEPUIS LISTE HISTORIQUE

### Fichier : `app/historique/page.js`

Ajouter un bouton 🗑️ sur chaque card de séance dans la liste.

**Modification des cards séance :**

```
┌─────────────────────────────────────────┐
│  📅 8 mars 2026 · 🏠 Maison · 45 min   │
│  💪 Pompes, Tractions, Développé couché │
│  🚴 Vélo 20 min                        │
│                                   [🗑️]  │  ← NOUVEAU : bouton supprimer
└─────────────────────────────────────────┘
```

**Bouton 🗑️ :**
- Position : en bas à droite de la card (ou à droite du header)
- Style : discret, texte rouge (#ef4444) ou muted par défaut → rouge au hover/tap
- Taille : petit mais touchable (min 44×44px zone de tap)
- Icône seule (pas de texte "Supprimer") pour rester compact

**⚠️ Empêcher les clics accidentels :**
- Le tap sur le 🗑️ ne doit PAS ouvrir le détail de la séance
- Utiliser `e.stopPropagation()` sur le handler du bouton supprimer

```jsx
<div onClick={() => router.push(`/historique/${seance.id}`)} style={{ cursor: 'pointer' }}>
  {/* ... contenu card ... */}
  <button
    onClick={(e) => {
      e.stopPropagation(); // empêche la navigation vers le détail
      handleDeleteSeance(seance.id, seance.date);
    }}
    style={{
      background: 'none',
      border: 'none',
      color: '#777',
      fontSize: 16,
      cursor: 'pointer',
      padding: 8,
      borderRadius: 8,
      minWidth: 44,
      minHeight: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    title="Supprimer cette séance"
  >
    🗑️
  </button>
</div>
```

**Confirmation avec détails :**
```js
async function handleDeleteSeance(seanceId, seanceDate) {
  const dateFormatted = new Date(seanceDate).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  if (!confirm(`Supprimer la séance du ${dateFormatted} ?\n\nCette action est irréversible. Toutes les séries et blocs cardio associés seront supprimés.`)) {
    return;
  }

  const { error } = await supabase
    .from('seances')
    .delete()
    .eq('id', seanceId);

  if (!error) {
    // Optimistic update : retirer de la liste locale
    setSeances(prev => prev.filter(s => s.id !== seanceId));
    // Toast succès optionnel : "Séance supprimée"
  } else {
    console.error('Erreur suppression séance:', error);
    // Toast erreur : "Erreur lors de la suppression"
  }
}
```

**CASCADE :** La suppression de la séance supprime automatiquement les cardio_blocs et series associés (FK ON DELETE CASCADE déjà en place).

---

## NE PAS TOUCHER

- ❌ /api/parse-seance, /api/coaching
- ❌ Mode NLP, mode manuel (sauf si on réutilise formatLastPerformance)
- ❌ Page détail /historique/[id] (la suppression depuis le détail existe déjà)
- ❌ Schéma DB
- ❌ Dashboard, Stats, Templates, Exercices, Profil

---

## TEST AVANT COMMIT

### Dernière performance dans template :
1. Créer une séance avec 2-3 exercices (pour avoir un historique)
2. Lancer une séance depuis un template contenant ces exercices
3. Vérifier "Dernière fois : ..." affiché sous chaque exercice de la checklist
4. Vérifier pré-remplissage du formulaire Loguer avec les bonnes valeurs
5. Exercice jamais fait → "Première fois 💪"
6. Vérifier conversion kg/lbs si profil en lbs

### Suppression depuis historique :
7. Aller sur /historique → vérifier bouton 🗑️ visible sur chaque card
8. Taper sur la card (pas le 🗑️) → ouvre le détail normalement
9. Taper sur 🗑️ → confirmation avec date → confirmer → séance disparaît
10. Vérifier en DB que séance + séries + cardio sont supprimés (CASCADE)
11. Annuler la confirmation → rien ne se passe
12. Responsive 375px → bouton touchable, pas de chevauchement

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Dernière performance dans checklist template + suppression rapide depuis historique"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Améliorations UX
- Dernière performance affichée dans la checklist template (pré-remplissage + résumé "3×10 × 60kg — il y a 3j")
- Batch loading des dernières perfs (1 requête pour tous les exercices du template)
- Suppression séance depuis la liste /historique (bouton 🗑️, confirmation avec date, optimistic update, CASCADE)
```