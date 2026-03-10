# BUGFIX — Réordonnement exercices ↑↓ ne fonctionne pas toujours

## PROBLÈME
En mode édition dans /historique/[id], les boutons ↑↓ pour réordonner les blocs exercices ne fonctionnent pas sur certains blocs intermédiaires. Les premiers et derniers (désactivés) ne sont pas concernés — c'est entre deux blocs du milieu que le clic ne produit aucun effet.

## CAUSE PROBABLE
Plusieurs blocs exercices ont le même `ordre` en DB (ex: deux blocs à 0, ou trois blocs à 1). Quand on échange deux ordres identiques, rien ne change visuellement. La fonction `normalizeOrdres()` actuelle ne corrige que le cas où TOUS les ordres sont identiques — elle rate les doublons partiels.

## CE QUE TU DOIS FAIRE

### Fichier : `app/historique/[id]/page.js`

### Étape 1 — Diagnostic

Avant de corriger, affiche en console les ordres actuels pour confirmer le problème :

```js
// Ajouter temporairement dans handleMoveExercice
console.log('=== ORDRES EXERCICES ===');
const blocs = getExerciceBlocs(seance.series);
blocs.forEach((b, i) => {
  console.log(`Bloc ${i}: ${b.exercice?.nom} → ordre=${b.ordre}`);
});
```

### Étape 2 — Fix normalizeOrdres

Remplacer la logique de normalisation actuelle par une version plus robuste qui se déclenche **systématiquement** avant chaque déplacement — pas seulement quand tous les ordres sont identiques :

```js
async function normalizeAndMove(exerciceId, direction) {
  // 1. Récupérer les blocs ordonnés
  const blocs = getExerciceBlocs(seance.series);
  
  // 2. Toujours renuméroter séquentiellement (0, 1, 2, 3...)
  //    Cela corrige les doublons, les trous, et les ordres identiques
  let needsNormalization = false;
  for (let i = 0; i < blocs.length; i++) {
    if (blocs[i].ordre !== i) {
      needsNormalization = true;
      break;
    }
  }

  if (needsNormalization) {
    // Renuméroter tous les blocs séquentiellement
    const updates = blocs.map((bloc, i) => 
      supabase
        .from('series')
        .update({ ordre: i })
        .eq('seance_id', seance.id)
        .eq('exercice_id', bloc.exercice_id)
    );
    await Promise.all(updates);

    // Mettre à jour le state local
    const updatedSeries = seance.series.map(s => {
      const blocIndex = blocs.findIndex(b => b.exercice_id === s.exercice_id);
      return { ...s, ordre: blocIndex };
    });

    // Recalculer les blocs avec les ordres normalisés
    blocs.forEach((b, i) => { b.ordre = i; });
  }

  // 3. Maintenant les ordres sont propres (0, 1, 2, 3...)
  //    On peut échanger
  const currentIndex = blocs.findIndex(b => b.exercice_id === exerciceId);
  const targetIndex = currentIndex + direction;

  if (targetIndex < 0 || targetIndex >= blocs.length) return;

  const currentBloc = blocs[currentIndex];
  const targetBloc = blocs[targetIndex];
  const currentOrdre = currentBloc.ordre;
  const targetOrdre = targetBloc.ordre;

  // 4. Échanger en DB
  await Promise.all([
    supabase
      .from('series')
      .update({ ordre: targetOrdre })
      .eq('seance_id', seance.id)
      .eq('exercice_id', currentBloc.exercice_id),
    supabase
      .from('series')
      .update({ ordre: currentOrdre })
      .eq('seance_id', seance.id)
      .eq('exercice_id', targetBloc.exercice_id),
  ]);

  // 5. Optimistic update complet
  setSeance(prev => ({
    ...prev,
    series: prev.series.map(s => {
      if (s.exercice_id === currentBloc.exercice_id) return { ...s, ordre: targetOrdre };
      if (s.exercice_id === targetBloc.exercice_id) return { ...s, ordre: currentOrdre };
      return s;
    })
  }));
}
```

### Étape 3 — Remplacer les appels

Remplacer `handleMoveExercice` par `normalizeAndMove` dans les onClick des boutons ↑↓.

Ou renommer directement `handleMoveExercice` avec cette nouvelle logique.

### Étape 4 — Même fix pour les cardio blocs

Appliquer la même logique de normalisation systématique avant échange pour les blocs cardio :

```js
async function normalizeAndMoveCardio(blocId, direction) {
  const sorted = [...seance.cardio_blocs].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

  // Renuméroter si nécessaire
  let needsNormalization = false;
  for (let i = 0; i < sorted.length; i++) {
    if ((sorted[i].ordre || 0) !== i) {
      needsNormalization = true;
      break;
    }
  }

  if (needsNormalization) {
    const updates = sorted.map((bloc, i) =>
      supabase.from('cardio_blocs').update({ ordre: i }).eq('id', bloc.id)
    );
    await Promise.all(updates);
    sorted.forEach((b, i) => { b.ordre = i; });
  }

  // Échanger
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

### Étape 5 — Retirer le console.log de diagnostic

Une fois le fix confirmé, supprimer les `console.log` de debug.

---

## NE PAS TOUCHER
- ❌ Tout le reste du mode édition (inline edit, ajout, suppression, changement exercice)
- ❌ Mode lecture
- ❌ Autres pages

## TEST
1. Ouvrir une séance avec 4+ exercices
2. Mode édition → vérifier boutons ↑↓
3. Cliquer ↓ sur le 1er exercice → il passe en 2e
4. Cliquer ↑ sur le 3e exercice → il passe en 2e
5. Cliquer ↑↓ plusieurs fois de suite rapidement → les ordres restent cohérents
6. Répéter pour une séance ancienne (ordres probablement tous à 0)
7. Tester aussi sur les blocs cardio
8. Vérifier en DB que les ordres sont bien séquentiels après manipulation

## COMMIT
```
git add .
git commit -m "Fix réordonnement exercices/cardio : normalisation séquentielle systématique avant échange"
git push
```