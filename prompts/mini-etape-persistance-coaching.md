# MINI-ÉTAPE — Persistance coaching IA dans historique séances

## CONTEXTE
Étape 8 (Templates) terminée et commitée.
3 nouvelles colonnes ont été ajoutées dans la table `seances` via SQL Editor :
```sql
coaching_before  TEXT DEFAULT NULL
coaching_during  TEXT DEFAULT NULL
coaching_after   TEXT DEFAULT NULL
```
Les policies RLS existantes couvrent déjà ces colonnes.

## CE QUE TU DOIS FAIRE

Sauvegarder les réponses du coaching IA dans la séance, et les afficher dans l'historique.

---

## 1. MODIFIER : `app/seance/page.js` — Sauvegarder le coaching

Après chaque appel à /api/coaching qui réussit, UPDATE la séance active avec la réponse.

**Mode before :**
- Quand le coaching before est reçu et affiché → UPDATE immédiat
```js
await supabase
  .from('seances')
  .update({ coaching_before: responseText })
  .eq('id', activeSeanceId);
```

**Mode during :**
- Le during peut être appelé plusieurs fois dans une séance
- Concaténer avec séparateur, pas écraser :
```js
// Récupérer la valeur actuelle
const { data: current } = await supabase
  .from('seances')
  .select('coaching_during')
  .eq('id', activeSeanceId)
  .single();

const updated = current.coaching_during
  ? current.coaching_during + '\n\n---\n\n' + responseText
  : responseText;

await supabase
  .from('seances')
  .update({ coaching_during: updated })
  .eq('id', activeSeanceId);
```

**Mode after :**
- Quand le bilan after est reçu et affiché → UPDATE immédiat
```js
await supabase
  .from('seances')
  .update({ coaching_after: responseText })
  .eq('id', activeSeanceId);
```

**⚠️ RÈGLES :**
- Les UPDATEs sont fire-and-forget (pas bloquants pour l'UI)
- Si l'UPDATE échoue → console.error, pas de message d'erreur utilisateur (bonus, pas critique)
- Ne PAS modifier le flow d'affichage du coaching — il reste identique côté UI pendant la séance

---

## 2. MODIFIER : `app/historique/[id]/page.js` — Afficher le coaching

Ajouter une section "🧠 Coaching IA" dans le détail de la séance, **après** le contenu existant (séries, cardio, texte brut).

**Conditions d'affichage :**
- N'afficher la section QUE si au moins un des 3 champs est non null
- Si aucun coaching → ne rien afficher (pas de section vide)

**Mise en page :**
```
🧠 Coaching IA
├── 🌅 Avant séance (si coaching_before non null)
│     [contenu texte, style violet, repliable]
├── ⚡ Pendant séance (si coaching_during non null)
│     [contenu texte, peut contenir des --- séparateurs, repliable]
└── 📊 Après séance (si coaching_after non null)
      [contenu texte, style violet, repliable]
```

**Design :**
- Titre section "🧠 Coaching IA" avec bordure violet (#a855f7)
- Chaque bloc : fond rgba(168,85,247,0.06), border rgba(168,85,247,0.15), border-radius 10px
- Texte en #c084fc
- Chaque bloc est **replié par défaut** (affiche juste le titre "🌅 Avant séance ▸")
- Au clic → déploie le contenu (toggle ▸ / ▾)
- Le coaching_during peut contenir des "---" → les rendre visuellement comme des séparateurs fins

**Requête :**
- Les colonnes coaching_before, coaching_during, coaching_after sont déjà incluses dans le SELECT existant de la séance (Supabase retourne toutes les colonnes par défaut si tu fais `.select('*')`)
- Si le SELECT est explicite → ajouter les 3 colonnes

---

## 3. NE PAS TOUCHER

- ❌ /api/coaching/route.js — rien ne change côté API
- ❌ /api/parse-seance/route.js
- ❌ Flow NLP, flow templates, flow multi-passes
- ❌ Schéma DB (colonnes déjà ajoutées)
- ❌ BottomNav, layout, autres pages

---

## 4. TEST AVANT COMMIT

1. Démarrer une séance (NLP ou template)
2. Demander un coaching before → vérifier en DB que coaching_before est rempli
3. Pendant la séance, demander un coaching during → vérifier coaching_during en DB
4. Demander un 2e coaching during → vérifier que le texte est concaténé (séparateur ---)
5. Terminer la séance → coaching after s'affiche → vérifier coaching_after en DB
6. Aller dans /historique/[id] de cette séance
7. Vérifier la section "🧠 Coaching IA" avec les 3 blocs repliables
8. Cliquer sur chaque bloc → contenu se déplie
9. Vérifier une ancienne séance SANS coaching → pas de section affichée

---

## 5. COMMIT + CLAUDE.md

Après tests OK :

**Commit :**
```
git add .
git commit -m "Persistance coaching IA : sauvegarde before/during/after dans seances + affichage historique"
git push
```

**Mise à jour CLAUDE.md — Ajouter dans la section des fonctionnalités :**
```
- Coaching IA persisté en DB (coaching_before, coaching_during, coaching_after dans seances)
- Coaching during concaténé sur appels multiples (séparateur ---)
- Affichage coaching dans détail historique /historique/[id] — blocs violets repliables
- Sauvegarde fire-and-forget (non bloquante pour le flow principal)
```

**Ajouter dans le schéma DB de CLAUDE.md :**
```
seances : ... + coaching_before TEXT, coaching_during TEXT, coaching_after TEXT
```