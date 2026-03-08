# PROMPT ÉTAPE 2 — Auth + Profil utilisateur + Layout bottom nav

## CONTEXTE PROJET
FORGE — App fitness tracking mobile-first iPhone, mono-utilisateur.
Stack : Next.js (App Router, JavaScript) + Supabase + Tailwind CSS.
Le projet est déjà setup (étape 1 terminée). Le client Supabase existe dans `lib/supabase.js`.
Les tables existent en DB (profils, exercices, seances, cardio_blocs, series, templates).
CLAUDE.md est à jour à la racine.

## CE QUE TU DOIS FAIRE — 3 SOUS-PARTIES

### PARTIE A — Page login (auth email/mot de passe)

Créer `app/login/page.js` :
- Client Component ("use client")
- Formulaire : email + mot de passe
- Deux boutons : "Se connecter" et "Créer un compte"
- Gestion des erreurs (email invalide, mot de passe trop court, compte inexistant)
- Après connexion réussie → rediriger vers `/`
- Utiliser `supabase.auth.signInWithPassword()` et `supabase.auth.signUp()`
- Pour signUp : afficher un message "Vérifie ton email pour confirmer ton compte"
- Design dark forge (voir tokens ci-dessous)
- Logo FORGE en haut du formulaire : texte "⚡ FORGE" en gras, gradient orange→rouge

### PARTIE B — Protection des routes + redirection

Modifier `app/page.js` (page d'accueil) :
- Vérifier si l'utilisateur est connecté via `supabase.auth.getSession()`
- Si pas connecté → rediriger vers `/login`
- Si connecté → afficher la page (pour l'instant un placeholder "Bienvenue sur FORGE")
- Afficher l'email de l'utilisateur connecté quelque part

### PARTIE C — Layout avec bottom nav mobile

Modifier `app/layout.js` :
- Server Component (pas de "use client" sur le layout)
- Font : Geist Sans + Geist Mono via Google Fonts (comme CAPSULE)
- Fond global : #0a0a0a
- Couleur texte par défaut : #f0f0f0

Créer `components/BottomNav.js` :
- Client Component ("use client")
- Barre de navigation fixée en bas de l'écran (position fixed, bottom 0)
- 4 onglets avec icônes emoji + label texte :
  - 🏠 Home → lien vers `/`
  - ⚡ Séance → lien vers `/seance`
  - 📋 Historique → lien vers `/historique`
  - 📊 Stats → lien vers `/stats`
- L'onglet actif est en orange (#f97316), les autres en gris (#777)
- Détecter la route active via `usePathname()` de `next/navigation`
- Hauteur bottom nav : 64px + safe area bottom (env(safe-area-inset-bottom))
- Ne PAS afficher la bottom nav sur la page `/login`
- Style : fond rgba(10,10,10,0.95), backdrop-blur, bordure top rgba(255,255,255,0.08)

Créer les pages placeholder (juste un titre pour l'instant) :
- `app/seance/page.js` → "Séance" (Client Component avec check auth)
- `app/historique/page.js` → "Historique" (Client Component avec check auth)
- `app/stats/page.js` → "Stats" (Client Component avec check auth)

### PARTIE D — Page profil (onboarding)

Créer `app/profil/page.js` :
- Client Component
- Formulaire avec les champs suivants :
  - Âge (number)
  - Sexe (select : Homme / Femme / Autre)
  - Poids (number + indication de l'unité choisie)
  - Taille en cm (number)
  - Objectif (select : Équilibre / Force / Cardio / Perte de poids / Prise de masse)
  - Niveau (select : Débutant / Intermédiaire / Confirmé)
  - Contextes disponibles (checkboxes : Maison / Salle / Extérieur)
  - Unité de poids préférée (toggle : kg / lbs)
- Au chargement : charger le profil existant depuis la table `profils` (SELECT WHERE user_id)
- Si pas de profil → formulaire vide (mode création)
- Si profil existe → pré-remplir les champs (mode édition)
- Bouton "Enregistrer" : UPSERT dans la table `profils`
- Si l'unité est lbs : convertir le poids saisi en kg avant sauvegarde (÷ 2.20462)
- Si l'unité est lbs : afficher le poids depuis la DB converti en lbs (* 2.20462)
- Feedback : message de succès temporaire (3s) après sauvegarde
- Ajouter un lien vers `/profil` dans la bottom nav (icône 👤) OU un bouton profil dans le header

Créer `utils/units.js` :
```javascript
// Conversion centralisée kg ↔ lbs
export const toDisplay = (kg, unite) =>
  unite === 'lbs' ? Math.round(kg * 2.20462 * 10) / 10 : kg;

export const toKg = (val, unite) =>
  unite === 'lbs' ? Math.round(val / 2.20462 * 100) / 100 : val;

export const unitLabel = (unite) => unite === 'lbs' ? 'lbs' : 'kg';
```

## DESIGN TOKENS — OBLIGATOIRES

```css
/* Fond et surfaces */
--bg: #0a0a0a;
--surface: rgba(255,255,255,0.04);
--surface-2: rgba(255,255,255,0.07);
--border: rgba(255,255,255,0.08);

/* Texte */
--text: #f0f0f0;
--muted: #777;

/* Couleurs sémantiques */
--accent: #f97316;          /* Orange — données utilisateur, CTA */
--accent2: #ea580c;         /* Orange foncé — hover */
--ai-color: #a855f7;        /* Violet — tout ce qui vient de l'IA */
--green: #22c55e;           /* Succès, records */
--red: #ef4444;             /* Erreurs, danger */
--yellow: #eab308;          /* Calories, énergie */
--blue: #3b82f6;            /* Cardio, infos neutres */

/* Gradient FORGE */
--forge: linear-gradient(135deg, #f97316, #dc2626);
```

## STRUCTURE DE FICHIERS ATTENDUE APRÈS ÉTAPE 2

```
app/
├── layout.js                  ← Modifié (Geist font, dark bg, import BottomNav)
├── page.js                    ← Modifié (check auth, redirect, placeholder Home)
├── login/
│   └── page.js                ← NOUVEAU (formulaire auth)
├── seance/
│   └── page.js                ← NOUVEAU (placeholder)
├── historique/
│   └── page.js                ← NOUVEAU (placeholder)
├── stats/
│   └── page.js                ← NOUVEAU (placeholder)
└── profil/
    └── page.js                ← NOUVEAU (formulaire profil)

components/
└── BottomNav.js               ← NOUVEAU (nav fixe en bas)

utils/
└── units.js                   ← NOUVEAU (conversions kg/lbs)

lib/
└── supabase.js                ← Existant (ne pas modifier)
```

## RÈGLES IMPÉRATIVES

- Commentaires en FRANÇAIS
- Noms de fichiers et variables en ANGLAIS
- JavaScript uniquement (PAS de TypeScript)
- Tailwind CSS pour le styling (pas de CSS modules)
- Mobile-first : tout doit être utilisable sur iPhone (375px)
- Gérer les 4 états : chargement, erreur, vide, succès
- NE PAS toucher à lib/supabase.js
- NE PAS installer de packages supplémentaires (tout est déjà dispo)
- Tester avec `npm run dev` avant de valider

## APRÈS IMPLÉMENTATION

1. Tester : npm run dev → localhost:3000
2. Vérifier : page login → inscription → confirmation email → connexion → page d'accueil → bottom nav → profil
3. Commit : `git add . && git commit -m "Étape 2 : Auth + Profil + Layout bottom nav" && git push`
4. Mettre à jour CLAUDE.md : cocher étape 2