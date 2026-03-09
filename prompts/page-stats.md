# PAGE STATS — Statistiques détaillées

## CONTEXTE
Projet FORGE — App fitness mobile-first, 10 étapes MVP terminées.
L'onglet Stats dans le bottom nav pointe vers /stats qui est un placeholder.
Recharts est déjà installé dans le projet (vérifier avec `npm list recharts`, sinon `npm install recharts`).
La page Home/dashboard a les KPIs résumés — /stats offre les vues détaillées.

## CE QUE TU DOIS FAIRE

Remplacer le placeholder /stats par une page de statistiques complète avec graphiques Recharts.

---

## SCHÉMA DB — COLONNES UTILES (rappel, ne pas inventer de colonnes)

```
seances : id, user_id, date, duree_totale, calories_totales, contexte, rpe, template_id
cardio_blocs : id, seance_id, type_cardio, duree_minutes, calories, rpe
series : id, seance_id, exercice_id, ordre, num_serie, repetitions, poids_kg
exercices : id, nom, categorie, groupe_musculaire, type, is_custom, source, user_id
profils : user_id, unite_poids, ... (pour conversion kg/lbs)
```

---

## MODIFIER : `app/stats/page.js`

Client Component ("use client"). Remplacer tout le contenu placeholder.

### Structure de la page (de haut en bas, scrollable)

```
┌─────────────────────────────────┐
│  📊 Statistiques                │
│  [7j] [30j] [90j] [Tout]       │  ← Filtre période (pills, défaut 30j)
├─────────────────────────────────┤
│  Résumé période                 │
│  12 séances · 8h20 · 4 320 kcal│  ← Chiffres clés de la période
├─────────────────────────────────┤
│  📈 Volume par semaine          │  ← BarChart Recharts
│  ┌───────────────────────┐      │
│  │  ▓▓  ▓▓▓ ▓▓  ▓▓▓▓    │      │  (nombre total de séries par semaine)
│  └───────────────────────┘      │
├─────────────────────────────────┤
│  💪 Répartition musculaire      │  ← PieChart ou BarChart horizontal
│  ┌───────────────────────┐      │
│  │  Pecs 25% Dos 20% ... │      │  (% séries par groupe musculaire)
│  └───────────────────────┘      │
├─────────────────────────────────┤
│  📈 Progression exercice        │  ← LineChart Recharts
│  [Sélecteur exercice ▼]         │
│  ┌───────────────────────┐      │
│  │  ╱‾‾╲  ╱‾‾           │      │  (poids max par séance sur la période)
│  └───────────────────────┘      │
├─────────────────────────────────┤
│  🏆 Records personnels (PR)     │  ← Liste des PR all-time
│  Développé couché  62 kg  🔥    │
│  Tractions         12 reps      │
│  Curl haltères     18 kg        │
└─────────────────────────────────┘
```

---

### CHARGEMENT DES DONNÉES

Au montage, charger tout en parallèle :

```js
const { data: { user } } = await supabase.auth.getUser();

// Profil (pour unités)
const { data: profil } = await supabase
  .from('profils')
  .select('unite_poids')
  .eq('user_id', user.id)
  .single();

// Toutes les séances (on filtre côté JS selon la période)
const { data: seances } = await supabase
  .from('seances')
  .select('id, date, duree_totale, calories_totales, contexte, rpe')
  .eq('user_id', user.id)
  .order('date', { ascending: true });

// Toutes les séries avec exercice
const { data: series } = await supabase
  .from('series')
  .select('seance_id, exercice_id, num_serie, repetitions, poids_kg, exercices(nom, groupe_musculaire, categorie)')
  .in('seance_id', seances.map(s => s.id));

// Tous les blocs cardio
const { data: cardioBlocs } = await supabase
  .from('cardio_blocs')
  .select('seance_id, duree_minutes, calories')
  .in('seance_id', seances.map(s => s.id));
```

⚠️ **ATTENTION** : Si la requête `series` avec `.in('seance_id', ...)` est trop grosse (des centaines de séances), il faudra filtrer par date via une jointure. Pour le MVP mono-utilisateur, ça passe.

⚠️ **Si `.in()` sur un tableau vide plante** → vérifier `seances.length > 0` avant d'appeler les requêtes séries/cardio.

---

### FILTRE PÉRIODE

```js
const PERIODES = [
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: 'Tout', days: null },
];

const [periode, setPeriode] = useState(30); // défaut 30 jours

// Filtrer les données selon la période sélectionnée
function filterByPeriode(data, dateField = 'date') {
  if (!periode) return data; // 'Tout'
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periode);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter(item => item[dateField] >= cutoffStr);
}

// Les séances filtrées
const filteredSeances = filterByPeriode(seances);
const filteredSeanceIds = new Set(filteredSeances.map(s => s.id));

// Les séries filtrées (via seance_id)
const filteredSeries = series.filter(s => filteredSeanceIds.has(s.seance_id));
```

**Design pills :**
- Ligne de pills horizontales, style cohérent avec le reste de FORGE
- Pill active : fond orange (#f97316), texte blanc
- Pill inactive : fond surface, texte muted, border
- Au tap → re-filtrer toutes les sections instantanément (pas de rechargement DB)

---

### SECTION 1 — Résumé de la période

Ligne de chiffres clés calculés depuis les données filtrées :

```js
const nbSeances = filteredSeances.length;
const dureeTotale = filteredSeances.reduce((sum, s) => sum + (s.duree_totale || 0), 0);
const caloriesTotales = filteredSeances.reduce((sum, s) => sum + (s.calories_totales || 0), 0);
const nbSeries = filteredSeries.length;
```

Affichage :
```
12 séances · 8h 20min · 4 320 kcal · 186 séries
```

- Durée en heures + minutes (ex: 500 min → "8h 20min")
- Si calories = 0 → ne pas afficher "0 kcal"
- Style : texte muted, chiffres bold

---

### SECTION 2 — Volume par semaine (BarChart)

Nombre total de séries par semaine (ou nombre de séances si tu préfères, mais les séries sont plus parlantes).

```js
// Grouper les séries par semaine (ISO week)
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  // Trouver le lundi de la semaine
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().split('T')[0]; // "2026-03-02" = lundi
}

// Construire les données pour Recharts
const volumeByWeek = {};
for (const s of filteredSeries) {
  const seance = seances.find(se => se.id === s.seance_id);
  if (!seance) continue;
  const week = getWeekKey(seance.date);
  volumeByWeek[week] = (volumeByWeek[week] || 0) + 1;
}

const volumeData = Object.entries(volumeByWeek)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([week, count]) => ({
    semaine: new Date(week).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    series: count
  }));
```

**Recharts BarChart :**
```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={200}>
  <BarChart data={volumeData}>
    <XAxis
      dataKey="semaine"
      tick={{ fill: '#777', fontSize: 11 }}
      axisLine={false}
      tickLine={false}
    />
    <YAxis hide />
    <Tooltip
      contentStyle={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#f0f0f0',
        fontSize: 12
      }}
      cursor={{ fill: 'rgba(249,115,22,0.1)' }}
    />
    <Bar
      dataKey="series"
      fill="#f97316"
      radius={[4, 4, 0, 0]}
      name="Séries"
    />
  </BarChart>
</ResponsiveContainer>
```

---

### SECTION 3 — Répartition musculaire (PieChart)

Pourcentage de séries par groupe musculaire.

```js
// Compter les séries par groupe musculaire
const repartition = {};
for (const s of filteredSeries) {
  const groupe = s.exercices?.groupe_musculaire || 'autres';
  repartition[groupe] = (repartition[groupe] || 0) + 1;
}

// Transformer pour Recharts
const GROUPE_COLORS = {
  pecs: '#f97316',
  dos: '#3b82f6',
  epaules: '#eab308',
  biceps: '#22c55e',
  triceps: '#14b8a6',
  jambes: '#a855f7',
  abdos: '#ef4444',
  full_body: '#ec4899',
  autres: '#6b7280',
};

// Labels lisibles
const GROUPE_LABELS = {
  pecs: 'Pecs',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  jambes: 'Jambes',
  abdos: 'Abdos',
  full_body: 'Full body',
  autres: 'Autres',
};

const pieData = Object.entries(repartition)
  .map(([groupe, count]) => ({
    name: GROUPE_LABELS[groupe] || groupe,
    value: count,
    fill: GROUPE_COLORS[groupe] || '#6b7280'
  }))
  .sort((a, b) => b.value - a.value);
```

**Recharts PieChart :**
```jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={220}>
  <PieChart>
    <Pie
      data={pieData}
      cx="50%"
      cy="50%"
      innerRadius={50}
      outerRadius={80}
      paddingAngle={2}
      dataKey="value"
    >
      {pieData.map((entry, i) => (
        <Cell key={i} fill={entry.fill} />
      ))}
    </Pie>
    <Tooltip
      contentStyle={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#f0f0f0',
        fontSize: 12
      }}
      formatter={(value, name) => [`${value} séries`, name]}
    />
  </PieChart>
</ResponsiveContainer>
```

**Légende sous le graphique :**
```jsx
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
  {pieData.map(item => (
    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill }} />
      <span style={{ color: '#777' }}>{item.name}</span>
    </div>
  ))}
</div>
```

---

### SECTION 4 — Progression exercice (LineChart)

Sélecteur d'exercice + courbe du poids max par séance.

```js
// Lister les exercices qui ont des séries dans la période
const exercicesAvecSeries = [...new Map(
  filteredSeries
    .filter(s => s.exercices)
    .map(s => [s.exercice_id, s.exercices.nom])
).entries()].map(([id, nom]) => ({ id, nom }));

const [selectedExercice, setSelectedExercice] = useState(null);

// Quand un exercice est sélectionné → construire la courbe
function buildProgressionData(exerciceId) {
  // Grouper par date de séance, prendre le MAX poids_kg par date
  const byDate = {};
  for (const s of filteredSeries) {
    if (s.exercice_id !== exerciceId) continue;
    const seance = seances.find(se => se.id === s.seance_id);
    if (!seance) continue;
    const date = seance.date;

    if (s.poids_kg != null) {
      // Exercice avec poids → max poids
      byDate[date] = Math.max(byDate[date] || 0, s.poids_kg);
    } else {
      // Poids du corps → max reps
      byDate[date] = Math.max(byDate[date] || 0, s.repetitions || 0);
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date: new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      valeur: value
    }));
}
```

**Sélecteur exercice :**
```jsx
<select
  value={selectedExercice || ''}
  onChange={e => setSelectedExercice(e.target.value)}
  style={{
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#f0f0f0',
    fontSize: 16, // anti-zoom iOS
    marginBottom: 12
  }}
>
  <option value="">Choisis un exercice...</option>
  {exercicesAvecSeries.map(ex => (
    <option key={ex.id} value={ex.id}>{ex.nom}</option>
  ))}
</select>
```

**Recharts LineChart :**
```jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

{selectedExercice && (
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={buildProgressionData(selectedExercice)}>
      <XAxis
        dataKey="date"
        tick={{ fill: '#777', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ fill: '#777', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={35}
      />
      <Tooltip
        contentStyle={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: '#f0f0f0',
          fontSize: 12
        }}
        formatter={(value) => {
          // Déterminer si c'est un exercice poids ou reps
          const isPoids = filteredSeries.some(s => s.exercice_id === selectedExercice && s.poids_kg != null);
          const unite = isPoids ? (profil?.unite_poids === 'lbs' ? 'lbs' : 'kg') : 'reps';
          return [`${isPoids ? toDisplay(value, profil?.unite_poids || 'kg') : value} ${unite}`, 'Max'];
        }}
      />
      <Line
        type="monotone"
        dataKey="valeur"
        stroke="#f97316"
        strokeWidth={2}
        dot={{ fill: '#f97316', r: 4 }}
        activeDot={{ r: 6 }}
      />
    </LineChart>
  </ResponsiveContainer>
)}
```

**Label dynamique :**
- Si exercice avec poids → afficher "kg" ou "lbs" selon le profil
- Si exercice poids du corps → afficher "reps max"
- Utiliser `toDisplay` de utils/units.js pour la conversion

---

### SECTION 5 — Records personnels (PR) all-time

Liste des meilleurs records par exercice, TOUT temps confondu (pas filtré par période).

```js
// Calculer les PR all-time (sur TOUTES les séries, pas filtrées)
function calcAllTimePR() {
  const prByExo = {};

  for (const s of series) { // series complètes, pas filtrées
    if (!s.exercices) continue;
    const key = s.exercice_id;
    const nom = s.exercices.nom;
    const groupe = s.exercices.groupe_musculaire;

    if (!prByExo[key]) {
      prByExo[key] = { nom, groupe, poids_kg: null, reps: null };
    }

    if (s.poids_kg != null && (prByExo[key].poids_kg === null || s.poids_kg > prByExo[key].poids_kg)) {
      prByExo[key].poids_kg = s.poids_kg;
    }
    if (s.repetitions != null && (prByExo[key].reps === null || s.repetitions > prByExo[key].reps)) {
      prByExo[key].reps = s.repetitions;
    }
  }

  return Object.values(prByExo)
    .sort((a, b) => (b.poids_kg || 0) - (a.poids_kg || 0));
}
```

**Affichage :**
```
🏆 Records personnels

  Développé couché     62 kg      (ou 137 lbs)
  Curl haltères        18 kg
  Tractions            12 reps    (poids du corps)
  Pompes               25 reps
```

- Card par exercice, fond surface, compact
- Badge groupe musculaire (couleur cohérente avec le PieChart)
- Poids affiché dans l'unité du profil (via toDisplay)
- Si poids_kg null → afficher les reps comme PR
- Emojis 🏆 sur le premier, 🥈 sur le 2e, 🥉 sur le 3e (optionnel)

---

## IMPORTS NÉCESSAIRES

```js
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toDisplay, unitLabel } from '@/utils/units';
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
```

---

## DESIGN

**Cohérent avec le reste de FORGE :**
- Dark mode exclusif (#0a0a0a)
- Cards : fond rgba(255,255,255,0.04), border rgba(255,255,255,0.08), border-radius 12px, padding 16px
- Titres sections : emoji + texte bold 14px, margin-bottom 12px
- Graphiques : fond transparent, tooltips dark (#1a1a1a)
- Couleurs graphiques : orange (#f97316) pour les barres et la ligne, palette par groupe pour le PieChart
- Labels Recharts : couleur muted (#777), taille 11px

**Responsive :**
- Tout en colonne sur mobile (375px)
- Graphiques en ResponsiveContainer (100% width)
- Select exercice : font-size 16px (anti-zoom iOS)
- Padding page : 20px mobile
- Padding bottom : assez pour le bottom nav (80px + safe area)

**États :**
- Loading : skeleton gris pulsant sur chaque section
- Vide (aucune séance) : "Aucune donnée pour cette période. Lance une séance !" + lien /seance
- Erreur : message discret, graphiques cachés

---

## NE PAS TOUCHER

- ❌ Autres pages
- ❌ API Routes
- ❌ BottomNav (le lien /stats existe déjà)
- ❌ Schéma DB

---

## TEST AVANT COMMIT

1. Ouvrir /stats → vérifier chargement (skeleton)
2. Données sur 30j par défaut → résumé correct
3. Changer la période (7j, 90j, Tout) → sections se mettent à jour
4. BarChart volume : barres orange, tooltip fonctionne
5. PieChart répartition : couleurs par groupe, légende visible
6. Sélectionner un exercice → LineChart progression s'affiche
7. Vérifier conversion kg/lbs si profil en lbs
8. Section PR : liste ordonnée, unités correctes
9. Tester avec 0 séance → message vide
10. Responsive 375px → tout scrollable, pas de débordement

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Page Stats : volume semaine, répartition musculaire, progression exercice, records PR — Recharts"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Page Stats
- Filtre période : 7j / 30j / 90j / Tout (pills, défaut 30j)
- Résumé : nb séances, durée totale, calories, nb séries
- BarChart volume par semaine (Recharts)
- PieChart répartition par groupe musculaire (donut, légende)
- LineChart progression par exercice (sélecteur, max poids ou reps)
- Records PR all-time (liste ordonnée, conversion kg/lbs)
- Responsive mobile, tooltips dark, skeleton loading
```

**Mettre à jour la ligne état :**
```
- [x] Page Stats : statistiques détaillées + graphiques Recharts
```