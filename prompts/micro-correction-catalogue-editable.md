# MICRO-CORRECTION — Exercices catalogue éditables

## CONTEXTE
Actuellement, seuls les exercices `is_custom=true` (ia_infere, manuel) ont les boutons ✏️🗑️ dans /exercices.
Les exercices du catalogue global (source='catalogue', user_id=NULL) sont en lecture seule.
Mono-utilisateur → il doit pouvoir corriger un nom ou un classement erroné sur n'importe quel exercice.

## CE QUE TU DOIS FAIRE

Modifier `app/exercices/page.js` :

### Édition : disponible sur TOUS les exercices

Le bouton ✏️ doit apparaître sur chaque exercice, pas seulement is_custom=true.

```js
// AVANT (restrictif)
{exercice.is_custom && <button onClick={...}>✏️</button>}

// APRÈS (tous éditables)
<button onClick={...}>✏️</button>
```

Le formulaire d'édition inline (nom, catégorie, groupe, type) fonctionne identiquement pour tous.

### Suppression : restreinte aux exercices perso uniquement

Le bouton 🗑️ reste visible **uniquement** sur les exercices `is_custom=true`.
On ne supprime pas un exercice du catalogue global — ça casserait les références.

```js
// Inchangé — suppression réservée aux perso
{exercice.is_custom && <button onClick={handleDeleteExercice}>🗑️</button>}
```

### Style du bouton ✏️ selon le type

Pour distinguer visuellement :
- Exercice catalogue → ✏️ en muted discret (le bouton est là mais moins proéminent)
- Exercice perso → ✏️ en couleur normale (comme actuellement)

```jsx
<button
  onClick={() => setEditingExercice(exercice)}
  style={{
    opacity: exercice.is_custom ? 1 : 0.5,  // discret sur catalogue
    // ... reste du style inchangé
  }}
>
  ✏️
</button>
```

## NE PAS TOUCHER
- ❌ La logique d'édition (UPDATE Supabase, normalisation) — elle reste identique
- ❌ La logique de suppression — restriction is_custom inchangée
- ❌ Le formulaire de création (toujours source='manuel', is_custom=true)
- ❌ Autres pages

## TEST
1. Exercice catalogue (ex: "Pompes") → bouton ✏️ visible (discret)
2. Cliquer ✏️ → formulaire inline → modifier le nom → Enregistrer → OK
3. Exercice catalogue → PAS de bouton 🗑️
4. Exercice perso (🧠 ou ✏️ badge) → boutons ✏️ ET 🗑️ visibles
5. Responsive 375px → boutons touchables

## COMMIT
```
git add .
git commit -m "Exercices catalogue éditables (nom, catégorie, groupe, type) — suppression toujours restreinte aux perso"
git push
```