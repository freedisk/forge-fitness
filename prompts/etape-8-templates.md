# ÉTAPE 8 — Templates de séance

## CONTEXTE
Projet FORGE — App fitness mobile-first, dark mode exclusif.
Stack : Next.js App Router + Supabase + Vercel + Tailwind CSS.
7 étapes terminées. Les deux piliers IA (NLP Haiku + Coaching Sonnet) fonctionnent.
Les tables `templates` et `template_exercices` existent déjà en DB avec RLS.

## CE QUE TU DOIS FAIRE

Implémenter le système de templates de séance : créer, gérer, et utiliser des templates pour démarrer une séance en 1 tap.

---

## SCHÉMA DB EXISTANT — NE PAS MODIFIER

```sql
-- Table templates (existe déjà)
templates (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom         text NOT NULL,
  description text,
  contexte    text,           -- 'maison' | 'salle' | 'mixte'
  source      text DEFAULT 'manuel'  -- 'manuel' | 'ia_genere'
)

-- Table template_exercices (existe déjà, PK composite)
template_exercices (
  template_id  uuid REFERENCES templates(id) ON DELETE CASCADE,
  exercice_id  uuid REFERENCES exercices(id) ON DELETE CASCADE,
  ordre        integer DEFAULT 0,
  PRIMARY KEY (template_id, exercice_id)
)

-- seances.template_id existe déjà (FK nullable vers templates)
```

**RLS déjà en place :**
- `templates_own` : ALL pour auth.uid() = user_id
- `template_exercices_own` : ALL via template_id parent

---

## FICHIERS À CRÉER / MODIFIER

### 1. CRÉER : `app/templates/page.js` — Page gestion templates

Page complète CRUD templates. Client Component ("use client").

**Vue liste :**
- Titre "Mes Templates" + compteur
- Bouton "+ Nouveau template" en haut
- Si aucun template : message vide "Aucun template. Crée ton premier !"
- Cards templates : nom, description (tronquée), contexte (badge maison/salle/mixte), nombre d'exercices, badge source
- Chaque card : boutons Utiliser (orange) / Modifier / Supprimer (avec confirmation)

**Modale création / édition :**
- Champs : nom (obligatoire), description (optionnel), contexte (sélecteur maison/salle/mixte)
- Section "Exercices du template" :
  - Bouton "+ Ajouter un exercice"
  - Au clic → affiche le catalogue exercices filtrable par groupe musculaire (pills horizontales comme sur /exercices)
  - Sélection d'un exercice → l'ajoute à la liste du template
  - Liste ordonnée des exercices ajoutés avec drag pour réordonner (ou boutons ↑↓ pour simplifier)
  - Bouton × pour retirer un exercice
- Bouton "Enregistrer" → INSERT ou UPDATE template + UPSERT template_exercices
- source = 'manuel' systématiquement (MVP)

**Requêtes Supabase :**
```js
// Charger les templates avec le nombre d'exercices
const { data: templates } = await supabase
  .from('templates')
  .select('*, template_exercices(exercice_id, ordre, exercices(nom, categorie, groupe_musculaire))')
  .order('nom');

// Charger le catalogue pour le sélecteur
const { data: exercices } = await supabase
  .from('exercices')
  .select('*')
  .or('user_id.is.null,user_id.eq.' + user.id)
  .order('groupe_musculaire,nom');

// Créer un template
const { data: newTemplate } = await supabase
  .from('templates')
  .insert({ nom, description, contexte, source: 'manuel', user_id: user.id })
  .select()
  .single();

// Ajouter les exercices (bulk insert)
const rows = selectedExercices.map((exId, i) => ({
  template_id: newTemplate.id,
  exercice_id: exId,
  ordre: i
}));
await supabase.from('template_exercices').insert(rows);

// Mise à jour : supprimer les anciens + réinsérer
await supabase.from('template_exercices').delete().eq('template_id', templateId);
await supabase.from('template_exercices').insert(newRows);

// Supprimer un template (CASCADE supprime template_exercices)
await supabase.from('templates').delete().eq('id', templateId);
```

---

### 2. MODIFIER : `app/seance/page.js` — Intégration templates

Ajouter un accès aux templates sur l'écran de séance, **en état `idle` uniquement** (pas quand une séance est en cours).

**Affichage en état idle (avant de commencer) :**
- Garder les éléments existants (zone NLP, coaching before)
- Ajouter une section "⚡ Templates rapides" ENTRE le coaching et la zone NLP
- Afficher les templates sous forme de pills/boutons compacts : nom + badge contexte
- Maximum 5 templates affichés, lien "Voir tous →" vers /templates si plus
- Si aucun template : petit lien discret "Créer un template →"

**Flow "Utiliser un template" :**
1. L'utilisateur tape sur un template
2. Créer la séance en DB avec `template_id` renseigné :
   ```js
   const { data: seance } = await supabase
     .from('seances')
     .insert({
       user_id: user.id,
       date: new Date().toISOString().split('T')[0],
       heure_debut: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
       contexte: template.contexte || 'maison',
       template_id: template.id
     })
     .select()
     .single();
   ```
3. Passer en état `active` avec la séance créée
4. Afficher les exercices du template comme une **checklist guidée** :
   - Liste des exercices du template dans l'ordre
   - Chaque exercice : nom + groupe musculaire
   - Bouton "Loguer" sur chaque exercice → ouvre un mini-formulaire inline :
     - Nombre de séries (défaut 3)
     - Pour chaque série : reps + poids (dans l'unité du profil)
     - Bouton "✅ Enregistrer" → INSERT dans series
   - Exercice logué → badge vert ✅, reste cliquable pour modifier
   - L'utilisateur peut aussi utiliser la zone NLP en parallèle (multi-passes existant)
5. Bouton "Terminer la séance" inchangé

**⚠️ IMPORTANT — Ne pas casser le flow existant :**
- La zone NLP texte libre reste disponible à tout moment
- Le coaching during/after fonctionne identiquement
- La persistance localStorage (forge_active_seance) inclut le template_id
- Le bouton "Terminer la séance" fonctionne pareil

---

### 3. MODIFIER : `app/historique/[id]/page.js` — Sauver comme template

Ajouter un bouton "📋 Sauver comme template" dans la page détail d'une séance.

**Flow :**
1. Bouton visible en bas du détail (style ghost, pas trop proéminent)
2. Au clic → mini-modale : nom du template (pré-rempli "Séance du [date]"), contexte (pré-rempli depuis la séance)
3. Confirmer → INSERT template + template_exercices (extraits des series de la séance, exercices uniques ordonnés)
4. Message succès "Template créé !" + lien vers /templates
5. source = 'manuel'

**Extraction des exercices depuis une séance :**
```js
// Récupérer les exercices uniques de la séance, dans l'ordre d'apparition
const exerciceIds = [...new Set(seance.series.map(s => s.exercice_id))];
```

---

### 4. OPTIONNEL — Lien dans BottomNav ou header

Ajouter un accès /templates quelque part. Options (choisis la plus simple) :
- Un lien dans la section templates de /seance ("Gérer mes templates →")
- PAS de nouvel onglet dans BottomNav (déjà 6 onglets, c'est assez)

---

## DESIGN

**Style cohérent avec FORGE :**
- Dark mode exclusif (#0a0a0a)
- Cards templates : même style que les cards exercices (surface rgba(255,255,255,0.04), border rgba(255,255,255,0.08))
- Badge contexte : maison = bleu, salle = orange, mixte = violet
- Badge source : 'manuel' = pas de badge ou discret, 'ia_genere' = badge violet 🧠 (V2)
- Bouton "Utiliser" = gradient forge (orange → rouge)
- Pills templates sur /seance : compacts, border fine, hover highlight
- Mini-formulaire séries dans le flow template : inline, pas de modale (mobile-first)
- Animations : fade-in cards, transition sur les badges ✅ quand exercice logué

**Unités :**
- Les champs poids dans le formulaire séries affichent l'unité du profil (kg ou lbs)
- Conversion via utils/units.js (toKg avant INSERT, toDisplay pour affichage)

---

## RÈGLES

- ⚠️ NE PAS toucher aux API Routes (/api/parse-seance, /api/coaching) — rien ne change côté IA
- ⚠️ NE PAS modifier le schéma DB — les tables existent déjà
- ⚠️ NE PAS casser le flow NLP existant sur /seance — les templates sont un AJOUT
- ⚠️ Vérifier les noms de colonnes exacts en DB avant de coder les requêtes (cf. pièges connus : contextes_dispo, type, pas d'accents, underscores)
- ✅ Commentaires en français
- ✅ Noms fichiers/variables en anglais
- ✅ Un seul commit à la fin : "Étape 8 : Templates de séance"
- ✅ Tester avant commit : créer un template, l'utiliser pour démarrer une séance, loguer des séries, terminer

---

## FLOW UTILISATEUR RÉSUMÉ

```
/templates          → Voir, créer, modifier, supprimer mes templates
/seance (idle)      → Section "Templates rapides" → tap → séance démarre avec checklist exercices
/seance (active)    → Checklist template + zone NLP + coaching = coexistent
/historique/[id]    → Bouton "Sauver comme template" → crée un template depuis la séance
```

---

## TEST COMPLET À FAIRE AVANT COMMIT

1. Aller sur /templates → vérifier page vide
2. Créer un template "Salle Full Body" (contexte: salle, 4-5 exercices)
3. Retourner sur /seance → voir le template dans "Templates rapides"
4. Taper sur le template → séance démarre → checklist exercices affichée
5. Loguer 2-3 exercices via le formulaire inline (vérifier unités kg/lbs)
6. Utiliser aussi la zone NLP pour ajouter un exercice supplémentaire (multi-passes)
7. Terminer la séance → coaching after fonctionne
8. Aller dans /historique → vérifier la séance avec template_id
9. Sur le détail → "Sauver comme template" → vérifier le nouveau template créé
10. Retourner sur /templates → vérifier les 2 templates