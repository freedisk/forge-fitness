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
seances : ... + coaching_before TEXT, coaching_during TEXT, coaching_after TEXT + rpe INTEGER DEFAULT NULL + calories_totales INTEGER + duree_totale INTEGER
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
- [x] Étape 6 : Historique + détail séance + records personnels (PR) + conversion unités + persistance séance active (localStorage)
- [x] Étape 7 : API Route coaching Sonnet 3 modes (before/during/after) + UI coaching violet + archivage prompts
- [x] Étape 8 : Templates de séance — CRUD /templates, checklist guidée /seance, sauver depuis /historique
- [x] Mini-étape : Persistance coaching IA — sauvegarde before/during/after dans seances + affichage historique (blocs violets repliables)
- [x] Mini-étape : Écran bilan fin de séance — durée éditable + calories Apple Watch + RPE 1-10 + coaching after enrichi
- [x] Étape 9 : Dashboard Home — KPIs + heatmap 12 semaines + CTA + dernière séance
- [x] Étape 10 : Polish final — retry/fallback IA, animations (parsing, PR pulse, toasts), responsive iPhone (safe area, touch targets, no-zoom), edge cases (séance vide, double-clic), favicon ⚡, manifest PWA
- [x] Page Stats : statistiques détaillées + graphiques Recharts

## Fonctionnalités coaching IA
- Coaching IA persisté en DB (coaching_before, coaching_during, coaching_after dans seances)
- Coaching during concaténé sur appels multiples (séparateur ---)
- Affichage coaching dans détail historique /historique/[id] — blocs violets repliables
- Sauvegarde fire-and-forget (non bloquante pour le flow principal)
- Coaching before différé : stocké en mémoire puis persisté à la création de la séance

## Bilan fin de séance
- Écran bilan intermédiaire (état 'finishing') entre "Terminer" et coaching after
- Durée pré-calculée (heure actuelle - heure_debut) et éditable
- Calories optionnelles (saisie Apple Watch)
- RPE 1-10 : pills colorées vert→rouge, sélection exclusive, optionnel
- "Valider le bilan" → UPDATE seance (duree_totale, calories_totales, rpe) → coaching after enrichi
- "Passer →" → sauvegarde durée auto seulement, skip le bilan
- Coaching after enrichi : RPE/calories/durée inclus dans le prompt si disponibles
- Affichage RPE coloré + calories dans /historique/[id] (badge conditionnel si rpe non null)

## Dashboard Home (Étape 9)
- 4 KPIs : streak (jours consécutifs), calories semaine, PR du mois, séances/semaine moyenne
- Heatmap 12 semaines style GitHub (CSS grid, niveaux orange)
- CTA "Commencer la séance" → /seance
- Résumé dernière séance avec lien détail
- Gestion états : loading skeleton, vide, erreur
- Calculs côté JS (streak, calories SUM, PR via MAX comparaison, moyenne séances)
- Couleurs KPI : Streak=#f97316, Calories=#eab308, PR=#22c55e, Séances=#3b82f6

## Polish & Production (Étape 10)
- API retry : 1 retry avec 1.5s délai sur parse-seance (Haiku) et coaching (Sonnet)
- Coaching fallback : messages encourageants si API indisponible (ne bloque jamais le flow)
- Animations CSS : slideUp (cards parsing), prPulse (badges PR), toastIn/toastOut (notifications)
- prefers-reduced-motion respecté (désactive toutes les animations)
- Responsive iPhone : font-size 16px (empêche zoom iOS), touch targets 44px min
- Edge cases : confirmation séance vide, double-clic protection, validation texte ≥ 5 chars
- PWA : manifest.json, favicon SVG ⚡, apple-mobile-web-app-capable
- Toast notifications : succès (vert) / erreur (rouge), auto-dismiss 3s

## Page Stats
- Filtre période : 7j / 30j / 90j / Tout (pills, défaut 30j)
- Résumé : nb séances, durée totale, calories, nb séries
- BarChart volume par semaine (Recharts)
- PieChart répartition par groupe musculaire (donut, légende)
- LineChart progression par exercice (sélecteur, max poids ou reps)
- Records PR all-time (liste ordonnée, conversion kg/lbs)
- Responsive mobile, tooltips dark, skeleton loading

## Statut
✅ FORGE MVP COMPLET — 10/10 étapes + Stats
Production : https://forge-fitness-one.vercel.app/
Repo : https://github.com/freedisk/forge-fitness