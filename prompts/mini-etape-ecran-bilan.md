# MINI-ÉTAPE — Écran bilan fin de séance (durée, calories, RPE)

## CONTEXTE
Colonne ajoutée en DB : `rpe INTEGER DEFAULT NULL` dans `seances`.
Les colonnes `duree_totale` et `calories_totales` existent déjà.
Actuellement, "Terminer la séance" calcule la durée auto et lance le coaching after directement.
On veut intercaler un écran bilan rapide ENTRE le clic "Terminer" et le coaching after.

## CE QUE TU DOIS FAIRE

Modifier `app/seance/page.js` pour ajouter un écran bilan de fin de séance.

---

## NOUVEAU FLOW "TERMINER LA SÉANCE"

```
État actuel :
  Terminer → UPDATE durée → coaching after → redirect

Nouveau flow :
  Terminer → ÉCRAN BILAN (durée + calories + RPE) → Valider → UPDATE séance → coaching after → redirect
```

### Nouvel état intermédiaire

Ajouter un état `finishing` (entre `active` et le coaching after) :

```
idle → parsed → active → finishing → (coaching after) → redirect
```

---

## ÉCRAN BILAN — Design

Quand l'utilisateur tape "Terminer la séance", afficher cet écran à la place du contenu séance :

```
┌─────────────────────────────────┐
│  📊 Bilan de la séance          │
│                                 │
│  ⏱️ Durée                       │
│  ┌───────────────────────┐      │
│  │ 45 min                │      │  ← pré-rempli (heure actuelle - heure_debut), éditable
│  └───────────────────────┘      │
│                                 │
│  🔥 Calories (Apple Watch)      │
│  ┌───────────────────────┐      │
│  │                       │      │  ← vide, saisie libre, clavier numérique
│  └───────────────────────┘      │
│                                 │
│  💪 Effort ressenti (RPE)       │
│                                 │
│  1  2  3  4  5  6  7  8  9  10 │  ← pills sélectables
│  🟢 🟢 🟡 🟡 🟠 🟠 🔴 🔴 🔴 🔴 │
│  ~~~~~~~~~~~sélection~~~~~~~~~~~~│
│  Léger    Modéré    Intense     │
│                                 │
│  ┌─────────────────────────┐    │
│  │   ✅ Valider le bilan    │    │  ← bouton gradient forge
│  └─────────────────────────┘    │
│                                 │
│  Passer →                       │  ← lien discret, skip le bilan
└─────────────────────────────────┘
```

---

## DÉTAILS D'IMPLÉMENTATION

### Durée pré-calculée

```js
// Calculer la durée depuis heure_debut de la séance
// heure_debut est stocké comme string "HH:MM" dans la séance
const now = new Date();
const [h, m] = seance.heure_debut.split(':').map(Number);
const debut = new Date();
debut.setHours(h, m, 0, 0);
const dureeAuto = Math.round((now - debut) / 60000); // en minutes
```

- Afficher dans un input number, éditable
- L'utilisateur peut corriger si la durée auto est incorrecte (pause, etc.)

### Calories

- Input number, vide par défaut, placeholder "Depuis Apple Watch"
- inputMode="numeric" pour clavier numérique sur iPhone
- Optionnel — peut rester vide

### RPE (1–10) — Pills visuelles

```jsx
const RPE_COLORS = {
  1: '#22c55e', 2: '#22c55e',   // vert — léger
  3: '#84cc16', 4: '#84cc16',   // vert-jaune
  5: '#eab308', 6: '#eab308',   // jaune — modéré
  7: '#f97316', 8: '#f97316',   // orange
  9: '#ef4444', 10: '#ef4444',  // rouge — intense
};

// Afficher 10 pills en ligne, wrap sur mobile
// Au tap → sélection exclusive (un seul actif)
// Pill active : fond coloré + border + scale légère
// Pill inactive : fond transparent + border muted
```

- Sous les pills : labels "Léger · Modéré · Intense" en muted
- Optionnel — peut ne pas être sélectionné

### Bouton "Valider le bilan"

Au clic :

```js
// 1. UPDATE la séance avec les 3 valeurs
await supabase
  .from('seances')
  .update({
    duree_totale: dureeInput || dureeAuto,
    calories_totales: caloriesInput || null,
    rpe: selectedRpe || null,
  })
  .eq('id', activeSeanceId);

// 2. Enchaîner avec le coaching after (flow existant)
// Le coaching after reçoit déjà la séance — ajouter le RPE dans le contexte si disponible
```

### Lien "Passer →"

- Style discret (texte muted, pas de bouton)
- Au clic → passe directement au coaching after sans UPDATE bilan
- La durée auto est quand même sauvegardée (comportement actuel conservé)

---

## MODIFIER AUSSI : Contexte coaching after

Dans l'appel au coaching after (`/api/coaching`), si le RPE est renseigné, l'inclure dans le payload :

```js
// Dans le body envoyé à /api/coaching mode 'after'
{
  mode: 'after',
  profil: { ... },
  historique: [ ... ],
  seance_actuelle: {
    // données existantes...
    rpe: selectedRpe || null,       // AJOUTER
    calories: caloriesInput || null, // AJOUTER
    duree: dureeInput || dureeAuto,  // AJOUTER
  }
}
```

Et dans `/api/coaching/route.js`, enrichir le prompt after si ces données sont présentes :

```js
// Dans le prompt système du mode 'after', ajouter :
// "L'utilisateur a indiqué un effort ressenti (RPE) de X/10."
// "Durée totale : X minutes. Calories : X kcal."
// → Intégrer dans l'analyse/bilan
```

---

## MODIFIER AUSSI : Affichage dans `/historique/[id]/page.js`

Afficher le RPE dans le header du détail de séance (à côté de la durée et du contexte) :

```
📅 8 mars 2026 · 🏠 Maison · ⏱️ 45 min · 🔥 320 kcal · 💪 RPE 7/10
```

- Badge RPE coloré selon la valeur (même palette que les pills)
- N'afficher que si rpe est non null

---

## NE PAS TOUCHER

- ❌ /api/parse-seance
- ❌ Flow NLP, flow templates, flow multi-passes
- ❌ Schéma DB (colonne déjà ajoutée)
- ❌ Autres pages (sauf /historique/[id] pour l'affichage RPE)

---

## TEST AVANT COMMIT

1. Démarrer une séance (NLP ou template)
2. Logger quelques exercices
3. Taper "Terminer" → écran bilan apparaît
4. Vérifier durée pré-remplie (approximativement correcte)
5. Saisir des calories (ex: 320)
6. Sélectionner un RPE (ex: 7) → vérifier couleur orange
7. Valider → coaching after se déclenche normalement
8. Vérifier en DB : duree_totale, calories_totales, rpe renseignés
9. Aller dans /historique/[id] → vérifier affichage RPE + calories
10. Refaire une séance → "Passer →" au bilan → vérifier que le coaching after fonctionne quand même
11. Vérifier que le coaching after mentionne le RPE/durée dans son analyse

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Écran bilan fin de séance : durée éditable + calories + RPE 1-10 + contexte coaching enrichi"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
- Écran bilan fin de séance (état 'finishing') : durée pré-calculée éditable, calories Apple Watch, RPE 1-10
- RPE : pills colorées vert→rouge, optionnel, persisté dans seances.rpe
- Bilan optionnel (lien "Passer") — flow non bloquant
- Coaching after enrichi avec RPE + calories + durée dans le contexte
- Affichage RPE coloré dans /historique/[id]
- Colonne ajoutée : seances.rpe INTEGER DEFAULT NULL
```