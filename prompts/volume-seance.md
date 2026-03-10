# AMÉLIORATION — Volume de séance (répétitions totales + charge totale)

## CONTEXTE
FORGE complet en production. On veut afficher deux métriques résumées à la fin de chaque séance :
- Répétitions totales = somme de toutes les reps
- Charge totale (tonnage) = somme de (reps × poids_kg) par série

Pas de modification DB — calcul à la volée depuis les séries existantes.

## CE QUE TU DOIS FAIRE

Ajouter le volume de séance à 3 endroits + enrichir le coaching after.

---

## 1. FONCTION DE CALCUL (réutilisable)

Créer une fonction utilitaire ou la placer en haut des fichiers qui l'utilisent :

```js
function calcVolumeSeance(series) {
  let totalReps = 0;
  let totalCharge = 0; // en kg

  for (const s of series) {
    const reps = s.repetitions || 0;
    const poids = s.poids_kg || 0; // null = poids du corps → 0 pour le tonnage
    totalReps += reps;
    totalCharge += reps * poids;
  }

  return { totalReps, totalCharge };
}

// Formatage du tonnage pour l'affichage
function formatCharge(chargeKg, unite) {
  if (unite === 'lbs') {
    const chargeLbs = Math.round(chargeKg * 2.20462);
    return chargeLbs >= 1000
      ? `${(chargeLbs / 1000).toFixed(1)}t`
      : `${chargeLbs} lbs`;
  }
  return chargeKg >= 1000
    ? `${(chargeKg / 1000).toFixed(1)}t`
    : `${Math.round(chargeKg)} kg`;
}
```

**Note :** Les exercices poids du corps (poids_kg = null) comptent dans les reps mais pas dans le tonnage. C'est le comportement standard — le tonnage ne concerne que les charges externes.

---

## 2. MODIFIER : `app/seance/page.js` — Écran bilan fin de séance

Dans l'état `finishing` (écran bilan entre "Terminer" et coaching after), ajouter un résumé volume **au-dessus** du formulaire durée/calories/RPE :

```
┌─────────────────────────────────────────┐
│  📊 Bilan de la séance                  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  💪 186 reps · 🏋️ 4.3t soulevés│    │  ← NOUVEAU : résumé volume
│  └─────────────────────────────────┘    │
│                                         │
│  ⏱️ Durée     [45] min                  │
│  🔥 Calories  [   ]                     │
│  💪 RPE       1 2 3 4 5 6 7 8 9 10     │
│                                         │
│  [✅ Valider le bilan]                  │
└─────────────────────────────────────────┘
```

**Calcul :**
```js
// Au moment d'afficher le bilan, calculer depuis les séries de la séance active
// Les séries sont déjà chargées/connues (elles ont été insérées pendant la séance)

const { totalReps, totalCharge } = calcVolumeSeance(seanceSeries);
```

**Design :**
- Bloc compact centré, fond rgba(249,115,22,0.08), border rgba(249,115,22,0.2), border-radius 10px, padding 12px
- Texte bold 16px, couleur orange (#f97316)
- Format : "💪 186 reps · 🏋️ 4.3t soulevés" (ou "4 280 kg" si < 1000)
- Si aucune série (séance cardio only) → afficher seulement les reps cardio ou ne pas afficher le bloc

**Aussi : inclure le volume dans le payload du coaching after :**
```js
// Dans l'appel à /api/coaching mode 'after', ajouter :
seance_actuelle: {
  // ... données existantes (rpe, calories, duree)
  total_reps: totalReps,       // AJOUTER
  total_charge_kg: totalCharge, // AJOUTER
}
```

---

## 3. MODIFIER : `/api/coaching/route.js` — Enrichir le prompt after

Dans le prompt système du mode `after`, si total_reps et total_charge_kg sont fournis, ajouter une ligne :

```js
// Dans la construction du prompt after :
if (seanceActuelle.total_reps) {
  promptParts.push(`Volume de la séance : ${seanceActuelle.total_reps} répétitions totales, ${seanceActuelle.total_charge_kg} kg de charge totale (tonnage).`);
}
```

Le coaching pourra ainsi commenter : "Tu as brassé 4.3 tonnes aujourd'hui, en hausse par rapport à ta moyenne."

---

## 4. MODIFIER : `app/historique/[id]/page.js` — Affichage dans le détail

Dans le header du détail de séance, à côté de la durée/calories/RPE :

```
📅 9 mars 2026 · 🏠 Maison · ⏱️ 45 min · 🔥 320 kcal · 💪 RPE 7/10
💪 186 reps · 🏋️ 4.3t soulevés    ← NOUVEAU
```

**Calcul :**
```js
// Les séries sont déjà chargées dans le détail de séance
const { totalReps, totalCharge } = calcVolumeSeance(seance.series || []);
```

**Design :**
- Ligne séparée sous le header existant (pas tout entasser sur une ligne)
- Texte 13px, couleur orange (#f97316), font-weight 600
- N'afficher que si totalReps > 0
- Charge affichée dans l'unité du profil (kg ou lbs, via formatCharge)

---

## 5. MODIFIER : `app/historique/page.js` — Résumé sur les cards (optionnel)

Sur chaque card de la liste historique, ajouter un résumé compact :

```
┌─────────────────────────────────────────┐
│  📅 9 mars · 🏠 Maison · 45 min        │
│  💪 Pompes, Tractions, Développé couché │
│  186 reps · 4.3t                        │  ← NOUVEAU (discret, muted)
└─────────────────────────────────────────┘
```

⚠️ **Attention performance** : le calcul nécessite les séries. Si la liste historique ne charge pas les séries (seulement les seances), il faut les charger. Deux options :
- **Option A** (simple) : charger les séries pour toutes les séances affichées en une requête `.in('seance_id', ids)`
- **Option B** (skip) : ne pas afficher le volume sur les cards, seulement dans le détail

Choisis l'option A si les séries sont déjà chargées dans la liste. Sinon Option B pour ne pas ajouter de requête.

---

## NE PAS TOUCHER

- ❌ /api/parse-seance
- ❌ Mode NLP, mode manuel, templates
- ❌ Schéma DB (zéro ALTER TABLE)
- ❌ Dashboard Home, Stats, Exercices, Profil

---

## TEST AVANT COMMIT

1. Démarrer une séance, loguer 3-4 exercices avec poids variés
2. Terminer → écran bilan → vérifier "💪 X reps · 🏋️ Xt soulevés" affiché
3. Vérifier le calcul manuellement (somme reps, somme reps×poids)
4. Exercice poids du corps (pompes) → reps comptées, pas de tonnage ajouté
5. Coaching after → vérifier que le volume est mentionné dans l'analyse
6. Aller dans /historique/[id] → vérifier la ligne volume dans le header
7. Vérifier conversion kg/lbs si profil en lbs (ex: "9 480 lbs" ou "4.3t")
8. Séance cardio only (pas de séries muscu) → pas de bloc volume affiché
9. Responsive 375px → le bloc volume ne déborde pas

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Volume de séance : répétitions totales + charge totale (tonnage) — bilan, historique, coaching after"
git push
```

**Mise à jour CLAUDE.md — Ajouter dans "Bilan fin de séance" :**
```
- Volume de séance affiché : répétitions totales + charge totale (tonnage en kg/lbs/tonnes)
- Calculé à la volée depuis les séries (pas de colonne DB)
- Affiché : écran bilan, détail historique, (optionnel) cards historique
- Tonnage = somme(reps × poids_kg) — exercices poids du corps exclus du tonnage
- Coaching after enrichi avec le volume pour analyse contextuelle
```