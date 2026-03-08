# FORGE — App Fitness avec IA intégrée

## Projet
App de tracking fitness mobile-first iPhone. Mono-utilisateur (JC).
Deux piliers IA : saisie NLP (Haiku) + coaching 3 temps (Sonnet).

## Stack
- Next.js (App Router, JavaScript, jsconfig.json alias @/*)
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS (dark mode exclusif)
- API Anthropic (Haiku pour parsing, Sonnet pour coaching)
- Vercel (CI/CD via GitHub)
- Recharts (dataviz)

## Design
- Dark mode exclusif (#0a0a0a)
- Orange (#f97316) = données utilisateur
- Violet (#a855f7) = tout ce qui vient de l'IA
- Bottom nav mobile (Home / Séance / Historique / Stats)

## Base de données (Supabase)
6 tables : profils, exercices, seances, cardio_blocs, series, templates
+ table liaison template_exercices
Catalogue exercices : ~55 exos seedés (source='catalogue', user_id NULL)
Auto-learning : exercices inférés par IA (source='ia_infere', user_id=UUID)
Stockage poids TOUJOURS en kg — conversion kg/lbs uniquement à l'affichage

## Conventions
- JavaScript uniquement (pas de TypeScript)
- Commentaires en français, noms fichiers/variables en anglais
- Un commit par feature, message en français
- Composants simples, pas d'abstraction prématurée
- Longs prompts → fichier prompt.md à la racine

## Variables d'environnement
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY (serveur uniquement)

## État actuel
- [x] Étape 1 : Setup projet + SQL 6 tables + seed catalogue + Vercel
- [x] Étape 2 : Auth + Profil + Layout bottom nav
- [x] Étape 3 : Catalogue exercices + badges source
- [x] Étape 4 : API Route parse-seance (Haiku) + validation
- [x] Étape 5 : Saisie NLP multi-passes + sauvegarde DB + auto-learning catalogue + normalisation accents/underscores
- [ ] Étape 6 : Historique + progression + PR
- [ ] Étape 7 : API Route coaching (Sonnet) — 3 modes
- [ ] Étape 8 : Templates
- [ ] Étape 9 : Dashboard heatmap + KPIs
- [ ] Étape 10 : Polish + gestion erreurs IA + prod