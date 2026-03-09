# ÉTAPE 9 — Dashboard Home : Heatmap + KPIs

## CONTEXTE
Projet FORGE — App fitness mobile-first, dark mode exclusif.
Étapes 1–8 + persistance coaching terminées.
La page d'accueil (app/page.js) est actuellement un placeholder avec check auth.
Recharts est dans les dépendances du projet (déjà utilisé dans CAPSULE, à installer si absent : `npm install recharts`).

## CE QUE TU DOIS FAIRE

Remplacer le placeholder Home par le vrai dashboard : 4 KPIs + heatmap 12 semaines + CTA + dernière séance.

---

## SCHÉMA DB — COLONNES UTILES (rappel)

```
seances : id, user_id, date, duree_totale, calories_totales, contexte, template_id
cardio_blocs : seance_id, calories, duree_minutes
series : seance_id, exercice_id, poids_kg, repetitions
exercices : id, nom, groupe_musculaire
```

---

## MODIFIER : `app/page.js` — Dashboard complet

Client Component ("use client"). Remplacer tout le contenu actuel.

### Structure de la page (de haut en bas)

```
┌─────────────────────────────────┐
│  ⚡ FORGE            Bonjour JC │  ← Header avec prénom ou email
├─────────────────────────────────┤
│  🔥 Streak    │  ⚡ Cal. sem.   │  ← 4 KPI cards (grille 2×2)
│  12 jours     │  2 340          │
│───────────────│─────────────────│
│  🏆 PR mois   │  💪 Séances/sem │
│  5 records    │  5.2            │
├─────────────────────────────────┤
│  Activité 12 semaines           │  ← Heatmap style GitHub
│  ░░▓▓░▓▓▓░▓░▓▓▓░░▓▓▓▓░▓...   │
│  Lun Mar Mer Jeu Ven Sam Dim   │
├─────────────────────────────────┤
│  ⚡ COMMENCER LA SÉANCE         │  ← CTA gradient forge → /seance
├─────────────────────────────────┤
│  📋 Dernière séance             │  ← Résumé dernière séance (optionnel)
│  Hier · Salle · 45 min · 3 exos│
└─────────────────────────────────┘
```

---

### CHARGEMENT DES DONNÉES

Au montage du composant, charger en parallèle :

```js
// 1. Toutes les séances des 90 derniers jours (couvre 12 semaines + marge)
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const { data: seances } = await supabase
  .from('seances')
  .select('id, date, duree_totale, calories_totales, contexte')
  .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
  .order('date', { ascending: false });

// 2. Toutes les séries du mois en cours (pour les PR)
const startOfMonth = new Date();
startOfMonth.setDate(1);

const { data: seriesThisMonth } = await supabase
  .from('series')
  .select('exercice_id, poids_kg, repetitions, seance_id, seances!inner(date, user_id)')
  .gte('seances.date', startOfMonth.toISOString().split('T')[0]);

// 3. Tous les MAX historiques par exercice (pour comparer les PR)
const { data: allSeries } = await supabase
  .from('series')
  .select('exercice_id, poids_kg, repetitions');

// 4. Profil utilisateur (pour le nom + unités)
const { data: profil } = await supabase
  .from('profils')
  .select('*')
  .single();

// 5. Dernière séance avec exercices
const { data: lastSeance } = await supabase
  .from('seances')
  .select('*, cardio_blocs(*), series(*, exercices(nom))')
  .order('date', { ascending: false })
  .limit(1)
  .single();
```

⚠️ **NOTE IMPORTANTE** : Si les requêtes avec `!inner` ou jointures complexes posent problème, simplifier en faisant des requêtes séparées et en joignant côté JS. Supabase client peut être capricieux sur les jointures filtrées.

---

### CALCUL DES 4 KPIs (côté JavaScript)

#### 🔥 Streak — Jours consécutifs d'entraînement

```js
// Algorithme : depuis aujourd'hui, remonter jour par jour
// Compter tant qu'on trouve une séance pour chaque jour
function calcStreak(seances) {
  // Extraire les dates uniques (Set)
  const datesSet = new Set(seances.map(s => s.date));

  let streak = 0;
  const today = new Date();

  // Commencer par aujourd'hui ou hier (si pas encore de séance aujourd'hui)
  const todayStr = today.toISOString().split('T')[0];
  let startDate = datesSet.has(todayStr) ? today : new Date(today.setDate(today.getDate() - 1));

  for (let i = 0; i < 365; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (datesSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
```

#### ⚡ Calories semaine en cours

```js
function calcCaloriesSemaine(seances) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=dim, 1=lun...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const mondayStr = monday.toISOString().split('T')[0];

  return seances
    .filter(s => s.date >= mondayStr)
    .reduce((sum, s) => sum + (s.calories_totales || 0), 0);
}
```

#### 🏆 Records PR ce mois

```js
// Un PR = exercice où le MAX poids_kg ce mois > MAX poids_kg avant ce mois
// Pour les exercices poids du corps (poids_kg null) : comparer MAX reps
function calcPRCount(seriesThisMonth, allSeries) {
  // Grouper toutes les séries par exercice_id
  const allMaxByExo = {};
  const monthMaxByExo = {};

  for (const s of allSeries) {
    const key = s.exercice_id;
    if (s.poids_kg != null) {
      allMaxByExo[key] = Math.max(allMaxByExo[key] || 0, s.poids_kg);
    } else {
      // Poids corps : comparer les reps
      allMaxByExo[key] = Math.max(allMaxByExo[key] || 0, s.repetitions || 0);
    }
  }

  for (const s of seriesThisMonth) {
    const key = s.exercice_id;
    if (s.poids_kg != null) {
      monthMaxByExo[key] = Math.max(monthMaxByExo[key] || 0, s.poids_kg);
    } else {
      monthMaxByExo[key] = Math.max(monthMaxByExo[key] || 0, s.repetitions || 0);
    }
  }

  // Compter les exercices où le max du mois = le max all-time (= record battu ou égalé CE mois)
  let prCount = 0;
  for (const exoId of Object.keys(monthMaxByExo)) {
    if (monthMaxByExo[exoId] >= (allMaxByExo[exoId] || 0) && monthMaxByExo[exoId] > 0) {
      prCount++;
    }
  }
  return prCount;
}
```

#### 💪 Séances par semaine (moyenne 4 dernières semaines)

```js
function calcSeancesPerWeek(seances) {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksStr = fourWeeksAgo.toISOString().split('T')[0];

  const count = seances.filter(s => s.date >= fourWeeksStr).length;
  return (count / 4).toFixed(1);
}
```

---

### HEATMAP 12 SEMAINES

**Pas de Recharts pour la heatmap** — elle est mieux en CSS pur (comme GitHub).

```
Structure : grille de 7 lignes (Lun→Dim) × 12 colonnes (semaines)
Chaque case = 1 jour
Couleur selon l'intensité (nombre de séries ou présence d'une séance)
```

**Niveaux d'intensité :**
- Pas de séance → rgba(255,255,255,0.05) (quasi invisible)
- Séance légère (cardio seul ou < 5 séries) → rgba(249,115,22,0.3) — orange clair
- Séance moyenne (5–15 séries) → rgba(249,115,22,0.55)
- Séance intense (> 15 séries ou longue durée) → rgba(249,115,22,0.8) — orange vif

**Calcul :**
```js
function buildHeatmapData(seances) {
  // Créer un map date → nombre de séries (ou durée)
  const dateMap = {};
  for (const s of seances) {
    dateMap[s.date] = (dateMap[s.date] || 0) + 1; // simple : présence
  }

  // Générer 84 jours (12 semaines) en remontant depuis dimanche prochain
  const days = [];
  const today = new Date();
  // Trouver le lundi de la semaine il y a 11 semaines
  const dayOfWeek = today.getDay(); // 0=dim
  const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startMonday = new Date(today);
  startMonday.setDate(today.getDate() - offsetToMonday - (11 * 7));

  for (let i = 0; i < 84; i++) {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isFuture = d > today;
    days.push({
      date: dateStr,
      level: isFuture ? -1 : (dateMap[dateStr] ? 1 : 0), // Simplification : 0 ou 1
      // Pour l'intensité réelle, il faudrait le nombre de séries par jour
    });
  }
  return days;
}
```

**Pour une intensité plus fine** (optionnel mais recommandé) : charger aussi le COUNT de séries par date. Sinon, la simple présence/absence fonctionne bien pour le MVP.

**Rendu CSS :**
```jsx
<div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: '3px' }}>
  {heatmapDays.map((day, i) => (
    <div
      key={i}
      title={day.date}
      style={{
        width: 12, height: 12, borderRadius: 2,
        background: day.level === -1
          ? 'transparent'       // futur
          : day.level === 0
          ? 'rgba(255,255,255,0.05)'  // pas de séance
          : 'rgba(249,115,22,0.7)'    // séance ce jour
      }}
    />
  ))}
</div>
```

**Labels jours :** afficher L M M J V S D à gauche de la grille (texte 10px, couleur muted).

**Légende optionnelle :** "Moins ░░▓▓ Plus" en bas à droite.

---

### CTA — COMMENCER LA SÉANCE

Gros bouton pleine largeur, gradient forge (orange → rouge), texte blanc bold.

```jsx
<button
  onClick={() => router.push('/seance')}
  style={{
    width: '100%',
    padding: '16px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #f97316, #dc2626)',
    color: 'white',
    fontWeight: 700,
    fontSize: 16,
    border: 'none',
    cursor: 'pointer'
  }}
>
  ⚡ COMMENCER LA SÉANCE
</button>
```

---

### DERNIÈRE SÉANCE (section en bas)

Afficher un résumé compact de la dernière séance :
- Date relative ("Aujourd'hui", "Hier", "Il y a 3 jours")
- Contexte (badge maison/salle)
- Durée totale
- Nombre d'exercices distincts
- Calories si disponible
- Lien "Voir le détail →" vers /historique/[id]

Si aucune séance → "Aucune séance encore. Lance-toi ! 🔥"

---

### GESTION DES ÉTATS

- **Chargement** : spinner ou skeleton (cards grises pulsantes) pendant le fetch
- **Vide** (aucune séance) : message d'accueil "Bienvenue sur FORGE ! Lance ta première séance." + CTA
- **Erreur** : message discret, dashboard affiche "—" pour les KPIs
- **Succès** : affichage complet

---

## DESIGN

**Palette (rappel) :**
- 🔥 Streak → orange (#f97316)
- ⚡ Calories → jaune (#eab308)
- 🏆 PR → vert (#22c55e)
- 💪 Séances/sem → bleu (#3b82f6)
- Heatmap → nuances orange
- CTA → gradient forge (orange → rouge)

**KPI Cards :**
- Grille 2×2, gap 12px
- Chaque card : fond rgba(255,255,255,0.04), border rgba(255,255,255,0.08), border-radius 10px
- Emoji en grand (20px), label en muted uppercase 10px, valeur en bold 24px avec la couleur du KPI
- Padding 16px

**Heatmap :**
- Fond : aucun (directement sur le bg #0a0a0a)
- Titre "Activité 12 semaines" en muted uppercase 10px
- Cases 12×12px, gap 3px, border-radius 2px
- gridTemplateRows: repeat(7, 1fr), gridAutoFlow: column → les semaines s'affichent en colonnes de haut en bas (Lun en haut, Dim en bas)

**Responsive mobile-first :**
- Sur iPhone : tout en une colonne, grille KPI 2×2 conservée
- Heatmap scrollable horizontalement si trop large (overflow-x: auto)
- CTA toujours pleine largeur
- Padding page : 20px sur mobile, 40px sur desktop

---

## NE PAS TOUCHER

- ❌ /api/parse-seance, /api/coaching
- ❌ /seance, /historique, /exercices, /templates, /profil
- ❌ BottomNav (la route "/" est déjà l'onglet Home)
- ❌ Schéma DB

---

## IMPORTS NÉCESSAIRES

```js
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// Recharts NON nécessaire pour cette page (heatmap en CSS pur, KPIs en texte)
// Recharts sera utilisé dans /stats (étape future V2)
```

---

## TEST AVANT COMMIT

1. Ouvrir la home → vérifier 4 KPIs affichés avec les bonnes valeurs
2. Vérifier le streak (compter manuellement les jours consécutifs en DB)
3. Vérifier les calories semaine (somme des séances de la semaine en cours)
4. Vérifier le nombre de PR ce mois
5. Vérifier la moyenne séances/semaine
6. Heatmap : vérifier que les jours avec séance sont colorés en orange
7. Heatmap : vérifier les jours futurs ne sont pas affichés (ou transparents)
8. Cliquer le CTA → redirige vers /seance
9. Section dernière séance : vérifier date, contexte, durée
10. Cliquer "Voir le détail" → redirige vers /historique/[id]
11. Tester avec 0 séance (nouveau compte) → message vide correct
12. Tester responsive mobile (375px)

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Étape 9 : Dashboard Home — KPIs + heatmap 12 semaines + CTA + dernière séance"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
Étape 9 ✅ — Dashboard Home
- 4 KPIs : streak (jours consécutifs), calories semaine, PR du mois, séances/semaine moyenne
- Heatmap 12 semaines style GitHub (CSS grid, niveaux orange)
- CTA "Commencer la séance" → /seance
- Résumé dernière séance avec lien détail
- Gestion états : loading skeleton, vide, erreur
- Calculs côté JS (streak, calories SUM, PR via MAX comparaison, moyenne séances)
```