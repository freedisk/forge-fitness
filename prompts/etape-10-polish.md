# ÉTAPE 10 — Polish final + Gestion erreurs IA + Production

## CONTEXTE
Projet FORGE — 9/10 étapes terminées. Tout fonctionne.
Cette étape est la dernière : on ne construit rien de neuf, on solidifie et on peaufine.
Objectif : une app qu'on peut utiliser tous les jours en salle sans accroc.

---

## 1. GESTION D'ERREURS IA — ROBUSTE

### /api/parse-seance (Haiku)

Dans `app/api/parse-seance/route.js` :

**Retry automatique :**
```js
// Si l'appel Haiku échoue (réseau, timeout, 500) → 1 retry avec délai
async function callHaikuWithRetry(payload, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        // ... config existante
      });
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Haiku attempt ${attempt} failed: ${response.status}`, errBody);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500)); // attendre 1.5s
          continue;
        }
        return { error: `Erreur IA (${response.status}). Réessaie ou utilise le mode manuel.` };
      }
      return await response.json();
    } catch (err) {
      console.error(`Haiku attempt ${attempt} network error:`, err);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return { error: 'Connexion impossible. Vérifie ta connexion ou utilise le mode manuel.' };
    }
  }
}
```

**Validation du JSON retourné :**
```js
// Après parsing de la réponse IA, vérifier la structure minimale
function validateParseResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (!result.seance) return false;
  // Au moins un exercice ou un bloc cardio
  const hasExercices = Array.isArray(result.seance.exercices) && result.seance.exercices.length > 0;
  const hasCardio = Array.isArray(result.seance.cardio) && result.seance.cardio.length > 0;
  return hasExercices || hasCardio;
}

// Si validation échoue → message clair à l'utilisateur
if (!validateParseResult(parsed)) {
  return Response.json({
    error: "L'IA n'a pas réussi à comprendre ta séance. Reformule ou utilise le mode manuel."
  }, { status: 422 });
}
```

### /api/coaching (Sonnet)

Dans `app/api/coaching/route.js` :

**Retry identique (1 retry, 1.5s délai).**

**Fallback si échec total :**
```js
// Si le coaching échoue après retry → retourner un message générique
// selon le mode, pour que le flow continue
const FALLBACK_MESSAGES = {
  before: "Je n'ai pas pu générer de plan pour le moment. Lance ta séance comme tu le sens, tu peux me redemander pendant ! 💪",
  during: "Désolé, je ne peux pas analyser ta séance en ce moment. Continue à ton rythme !",
  after: "L'analyse n'est pas disponible pour le moment. Ta séance a bien été enregistrée. 🔥"
};

// En cas d'erreur → retourner le fallback au lieu d'une erreur HTTP
return Response.json({ message: FALLBACK_MESSAGES[mode], fallback: true });
```

### Côté client (app/seance/page.js)

**Afficher les erreurs proprement :**
```js
// Quand l'appel parse-seance échoue :
// - Message d'erreur orange/rouge visible 5 secondes
// - Bouton "Réessayer" pour relancer l'analyse
// - Mention "ou utilise le mode manuel" en texte muted

// Quand le coaching échoue :
// - Afficher le message fallback en violet (même style que le coaching normal)
// - Badge discret "hors ligne" si fallback: true
// - Ne JAMAIS bloquer le flow principal
```

---

## 2. ANIMATIONS & FEEDBACK

### Confirmation parsing NLP

Dans `app/seance/page.js`, quand le parsing réussit et s'affiche :

```css
/* Animation fade-in + slide-up pour les cards de validation */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Appliquer sur chaque card d'exercice parsé avec un stagger */
.parse-card {
  animation: slideUp 0.3s ease-out forwards;
}
.parse-card:nth-child(1) { animation-delay: 0s; }
.parse-card:nth-child(2) { animation-delay: 0.08s; }
.parse-card:nth-child(3) { animation-delay: 0.16s; }
/* etc — ou utiliser style={{ animationDelay: `${index * 0.08}s` }} */
```

### Animation PR record battu 🔥

Quand un record personnel est détecté au parsing (déjà visible dans l'écran de validation) :

```css
/* Badge PR avec pulse + glow */
@keyframes prPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50% { transform: scale(1.1); box-shadow: 0 0 12px 4px rgba(34, 197, 94, 0.2); }
}

.pr-badge {
  animation: prPulse 1.5s ease-in-out 2; /* pulse 2 fois puis s'arrête */
}
```

Ajouter aussi dans le **détail historique** (`/historique/[id]`) sur les badges 🏆 PR.

### Confirmation sauvegarde séance

Quand l'utilisateur confirme le parsing et que les données sont sauvées en DB :

```js
// Message toast temporaire (3 secondes)
// "✅ Exercices ajoutés à la séance !" — fond vert, fade-in/out
```

Même principe pour "Séance terminée !" après le bilan.

### Feedback bouton "Analyser"

Quand l'utilisateur tape "⚡ Analyser" :
- Le bouton passe en état loading : texte "Analyse en cours..." + spinner
- Désactiver le bouton pour éviter les double-clics
- Si déjà en cours → ignorer le clic

```js
const [isParsing, setIsParsing] = useState(false);

// Dans le handler :
if (isParsing) return;
setIsParsing(true);
try {
  // ... appel API
} finally {
  setIsParsing(false);
}
```

Idem pour les boutons coaching ("🧠 Demander un plan", "🧠 Quoi faire ensuite ?").

### Respect prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .parse-card, .pr-badge {
    animation: none !important;
  }
}
```

---

## 3. RESPONSIVE FINAL — TEST iPhone

### Points à vérifier et corriger

**Bottom nav :**
- Hauteur fixe (56-64px)
- Safe area iPhone : `padding-bottom: env(safe-area-inset-bottom)` sur le nav
- Z-index élevé (50+) pour rester au-dessus du contenu

```css
/* Dans BottomNav ou layout */
.bottom-nav {
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
}
```

**Contenu principal :**
- Padding bottom suffisant pour ne pas être caché par le bottom nav :
```css
main {
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}
```

**Page séance — zone NLP :**
- Le textarea doit être suffisamment grand pour taper confortablement (min-height: 100px)
- Sur iOS, le clavier pousse le contenu → vérifier que le textarea reste visible
- inputMode="text" sur le textarea (pas de clavier numérique)

**Écran bilan :**
- Les pills RPE 1-10 doivent wrap proprement sur petit écran
- Taille touch minimale 44×44px par pill
- Les inputs durée/calories : inputMode="numeric" pour clavier numérique iPhone

**Dashboard Home :**
- Heatmap : vérifier qu'elle ne déborde pas → overflow-x: auto si nécessaire
- KPIs grille 2×2 : vérifier qu'elle tient sur 375px de large
- CTA : pleine largeur, padding généreux (min 48px de hauteur)

**Historique :**
- Cards séances : texte pas trop petit (min 13px)
- Détail séance : tableaux de séries scrollables horizontalement si nécessaire

**Templates :**
- Modale création : bien scrollable si beaucoup d'exercices
- Boutons suffisamment espacés (pas de misclick)

**Général :**
```css
/* Empêcher le zoom auto sur les inputs iOS (font-size < 16px = zoom) */
input, textarea, select {
  font-size: 16px; /* minimum pour éviter le zoom iOS */
}

/* Touch targets */
button, a, .clickable {
  min-height: 44px;
  min-width: 44px;
}
```

---

## 4. EDGE CASES & ROBUSTESSE

### Séance vide
- Si l'utilisateur tape "Terminer" sans avoir logué aucun exercice/cardio → confirmation "Tu n'as rien enregistré. Terminer quand même ?"
- Si oui → terminer normalement (la séance vide reste en DB, le coaching after gère)

### Texte NLP vide ou trop court
- Si le textarea est vide → bouton "Analyser" désactivé (grisé)
- Si le texte fait moins de 5 caractères → message "Décris au moins un exercice"

### Perte de connexion
- Si Supabase est injoignable au chargement → message "Connexion impossible. Vérifie ta connexion internet." au lieu d'un écran blanc
- Dashboard : afficher "—" pour chaque KPI en cas d'erreur de chargement

### Double-clic protection
- Tous les boutons d'action (Analyser, Confirmer, Terminer, Valider bilan, Sauver template) doivent être désactivés pendant le traitement
- Pattern : `const [isLoading, setIsLoading] = useState(false)` + `disabled={isLoading}`

### Session expirée
- Si Supabase retourne une erreur d'auth (401/403) → redirect vers /login
- Vérifier sur les pages clés : /seance, /historique, /templates, /exercices, dashboard

---

## 5. PETITS DÉTAILS UX

### Page /exercices
- Si le catalogue est vide (ne devrait pas arriver) → message "Catalogue vide"

### Page /historique
- Si aucune séance → message "Aucune séance enregistrée. Lance-toi !" + lien /seance

### Favicon
- Vérifier qu'il y a un favicon (emoji ⚡ ou icône simple). Si absent :
```js
// Dans app/layout.js metadata
export const metadata = {
  title: 'FORGE — Fitness Tracker',
  description: 'App de tracking fitness avec IA',
  icons: { icon: '/favicon.ico' },
};
```
- Si pas de fichier favicon.ico → créer un simple SVG favicon :
```html
<!-- Dans layout.js head ou via metadata -->
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
```

### Meta viewport
- Vérifier dans layout.js :
```js
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // empêche le pinch-to-zoom non voulu sur iPhone
  userScalable: false,
  themeColor: '#0a0a0a',
};
```

### PWA-ready (bonus rapide)
- Ajouter dans metadata :
```js
export const metadata = {
  title: 'FORGE',
  description: 'Fitness Tracker avec IA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FORGE',
  },
};
```
- Créer `public/manifest.json` :
```json
{
  "name": "FORGE — Fitness Tracker",
  "short_name": "FORGE",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```
- Générer un icon-192.png simple (carré noir avec ⚡ orange) ou skipper les icônes pour l'instant — le manifest suffit pour le "Add to Home Screen" sur iPhone.

---

## 6. NE PAS TOUCHER

- ❌ Logique métier des API Routes (parsing, coaching) — seulement ajouter retry/fallback
- ❌ Schéma DB
- ❌ Flow fonctionnel (NLP, templates, multi-passes, coaching, bilan)
- ❌ Calculs KPI du dashboard

---

## 7. TEST BOUT EN BOUT AVANT COMMIT FINAL

### Parcours complet (simuler une vraie séance) :

1. **Dashboard** → vérifier KPIs, heatmap, dernière séance
2. **CTA** → "Commencer la séance" → arrive sur /seance
3. **Coaching before** → demander un plan → message violet → vérifier sauvegarde DB
4. **Template** → utiliser un template → checklist exercices → loguer 2 exercices
5. **NLP** → ajouter un exercice en texte libre → parsing → validation → confirmer
6. **Coaching during** → "Quoi faire ensuite ?" → suggestion → vérifier concaténation DB
7. **Terminer** → écran bilan → saisir durée/calories/RPE → valider
8. **Coaching after** → bilan violet → "OK compris" → redirect
9. **Historique** → vérifier séance complète (exercices + coaching + RPE + calories)
10. **Sauver template** → depuis le détail → vérifier template créé

### Tests d'erreur :

11. **NLP texte vide** → bouton désactivé
12. **Double-clic** sur Analyser → un seul appel
13. **Séance vide** → Terminer → confirmation
14. **Responsive** → tester sur 375px de large (DevTools mobile)
15. **PWA** → ouvrir sur iPhone Safari → "Ajouter à l'écran d'accueil" → vérifier l'icône et le standalone

---

## 8. COMMIT FINAL + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Étape 10 : Polish final — gestion erreurs IA, animations, responsive iPhone, PWA, edge cases"
git push
```

**Mise à jour CLAUDE.md — Remplacer la ligne étape 10 :**
```
- [x] Étape 10 : Polish final — retry/fallback IA, animations (parsing, PR pulse, toasts), responsive iPhone (safe area, touch targets, no-zoom), edge cases (séance vide, double-clic, session expirée), favicon ⚡, manifest PWA
```

**Ajouter une section finale :**
```
## Statut
✅ FORGE MVP COMPLET — 10/10 étapes
Production : https://forge-fitness-one.vercel.app/
Repo : https://github.com/freedisk/forge-fitness
```