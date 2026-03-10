# AMÉLIORATION — Suivi de consommation API (Token Usage)

## CONTEXTE
FORGE utilise 2 API Routes Anthropic :
- `/api/parse-seance` — Haiku (parsing NLP)
- `/api/coaching` — Sonnet (coaching 3 temps)

Chaque appel coûte des tokens. On veut tracker la consommation pour savoir combien coûte l'app.
L'API Anthropic retourne `usage.input_tokens` et `usage.output_tokens` dans chaque réponse.

## CE QUE TU DOIS FAIRE

1. Créer une table de suivi en DB
2. Logger chaque appel API automatiquement
3. Afficher un résumé de consommation dans la page Profil

---

## ÉTAPE 1 — CRÉER LA TABLE (SQL à exécuter dans Supabase SQL Editor)

```sql
CREATE TABLE api_usage (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,          -- 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5-20250514'
  model_short TEXT NOT NULL,          -- 'haiku' | 'sonnet' (pour affichage)
  route       TEXT NOT NULL,          -- 'parse-seance' | 'coaching'
  mode        TEXT,                   -- null (parsing) | 'before' | 'during' | 'after' (coaching)
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_usd    NUMERIC(10,6) DEFAULT 0  -- coût estimé en USD
);

-- RLS
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_own" ON api_usage FOR ALL USING (auth.uid() = user_id);

-- Index pour les requêtes d'agrégation
CREATE INDEX idx_api_usage_user_date ON api_usage (user_id, created_at DESC);
```

⚠️ **Exécuter ce SQL dans Supabase SQL Editor AVANT de lancer le prompt dans Claude Code.**

---

## ÉTAPE 2 — LOGGER DANS LES API ROUTES

### Tarifs Anthropic (à date mars 2026 — à vérifier)

```js
// Tarifs par million de tokens (approximatifs)
const PRICING = {
  'haiku': { input: 0.80, output: 4.00 },    // $/M tokens
  'sonnet': { input: 3.00, output: 15.00 },   // $/M tokens
};

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['sonnet'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
```

⚠️ **Ces tarifs sont approximatifs.** Ils peuvent avoir changé. Le coût est une estimation, pas une facture exacte. L'afficher comme tel.

### MODIFIER : `app/api/parse-seance/route.js`

Après l'appel réussi à l'API Anthropic, logger la consommation :

```js
// L'API Anthropic retourne un objet avec usage
// response.usage = { input_tokens: 234, output_tokens: 567 }

const data = await response.json();

// Logger la consommation (fire-and-forget, non bloquant)
if (data.usage) {
  const { createClient } = require('@supabase/supabase-js');
  // Utiliser le service role key pour écrire sans passer par le RLS client
  // OU simplement passer le user_id depuis le body de la requête
  
  // Option simple : le user_id est déjà dans le body de la requête
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  supabaseAdmin.from('api_usage').insert({
    user_id: body.user_id,  // ← s'assurer que le user_id est envoyé dans le body
    model: 'claude-haiku-4-5-20251001',
    model_short: 'haiku',
    route: 'parse-seance',
    mode: null,
    input_tokens: data.usage.input_tokens,
    output_tokens: data.usage.output_tokens,
    cost_usd: estimateCost('haiku', data.usage.input_tokens, data.usage.output_tokens),
  }).then(() => {}).catch(err => console.error('Usage log error:', err));
}
```

⚠️ **IMPORTANT — user_id côté serveur :**
Les API Routes ne connaissent pas le user connecté directement. Le client doit envoyer le `user_id` dans le body de la requête. Vérifier que c'est déjà le cas dans les appels fetch depuis `/seance/page.js` et `/historique/[id]/page.js`. Si ce n'est pas le cas, l'ajouter.

Alternative : extraire le user_id depuis le token Supabase passé en header Authorization. Mais la méthode la plus simple est de l'inclure dans le body.

### MODIFIER : `app/api/coaching/route.js`

Même principe, avec les différences :

```js
if (data.usage) {
  supabaseAdmin.from('api_usage').insert({
    user_id: body.user_id,
    model: 'claude-sonnet-4-5-20250514',
    model_short: 'sonnet',
    route: 'coaching',
    mode: body.mode,  // 'before' | 'during' | 'after'
    input_tokens: data.usage.input_tokens,
    output_tokens: data.usage.output_tokens,
    cost_usd: estimateCost('sonnet', data.usage.input_tokens, data.usage.output_tokens),
  }).then(() => {}).catch(err => console.error('Usage log error:', err));
}
```

### Fonction estimateCost partagée

Créer `utils/pricing.js` :

```js
// Tarifs approximatifs par million de tokens (mars 2026)
const PRICING = {
  haiku: { input: 0.80, output: 4.00 },
  sonnet: { input: 3.00, output: 15.00 },
};

export function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['sonnet'];
  return parseFloat(((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000).toFixed(6));
}

export function formatCost(costUsd) {
  if (costUsd < 0.01) return `$${(costUsd * 100).toFixed(2)}¢`;
  return `$${costUsd.toFixed(4)}`;
}

export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${tokens}`;
}
```

---

## ÉTAPE 3 — S'ASSURER QUE user_id EST ENVOYÉ DANS LES APPELS

### Vérifier dans `app/seance/page.js`

Les appels fetch vers /api/parse-seance et /api/coaching doivent inclure `user_id` dans le body :

```js
// Appel parse-seance
const res = await fetch('/api/parse-seance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    texte: inputText,
    user_id: user.id,   // ← S'ASSURER QUE C'EST LÀ
    // ... autres champs existants
  }),
});

// Appel coaching
const res = await fetch('/api/coaching', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'before',
    user_id: user.id,   // ← S'ASSURER QUE C'EST LÀ
    // ... autres champs existants
  }),
});
```

Faire la même vérification dans `app/historique/[id]/page.js` si des appels API y sont faits (ajout NLP en mode édition).

---

## ÉTAPE 4 — AFFICHAGE DANS LA PAGE PROFIL

### MODIFIER : `app/profil/page.js`

Ajouter une section "📊 Consommation API" en bas de la page profil, après le formulaire existant.

```
┌─────────────────────────────────────────┐
│  📊 Consommation API                    │
│                                         │
│  Ce mois (mars 2026)                    │
│  ┌────────────┬────────────┐            │
│  │  🟡 Haiku  │  🟣 Sonnet │            │
│  │  12 appels │  8 appels  │            │
│  │  45k tokens│  120k tokens│           │
│  │  $0.0234   │  $0.1850   │            │
│  └────────────┴────────────┘            │
│                                         │
│  Total mois : $0.21                     │
│  Total tout temps : $0.87               │
│                                         │
│  📈 Détail par semaine                  │
│  Sem. 10 : 8 appels · $0.12            │
│  Sem. 9  : 6 appels · $0.05            │
│  Sem. 8  : 6 appels · $0.04            │
│                                         │
│  ⚠️ Coûts estimés (tarifs approximatifs)│
└─────────────────────────────────────────┘
```

### Chargement des données

```js
// Consommation du mois en cours
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const { data: usageThisMonth } = await supabase
  .from('api_usage')
  .select('*')
  .gte('created_at', startOfMonth.toISOString())
  .order('created_at', { ascending: false });

// Total tout temps
const { data: usageAll } = await supabase
  .from('api_usage')
  .select('cost_usd, input_tokens, output_tokens');
```

### Calculs

```js
function calcUsageStats(usageData) {
  const byModel = { haiku: { calls: 0, tokens: 0, cost: 0 }, sonnet: { calls: 0, tokens: 0, cost: 0 } };

  for (const u of usageData) {
    const model = u.model_short || 'sonnet';
    byModel[model].calls++;
    byModel[model].tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
    byModel[model].cost += parseFloat(u.cost_usd || 0);
  }

  const total = {
    calls: byModel.haiku.calls + byModel.sonnet.calls,
    tokens: byModel.haiku.tokens + byModel.sonnet.tokens,
    cost: byModel.haiku.cost + byModel.sonnet.cost,
  };

  return { byModel, total };
}

// Détail par semaine (regroupement)
function calcWeeklyUsage(usageData) {
  const weeks = {};
  for (const u of usageData) {
    const date = new Date(u.created_at);
    const weekNum = getISOWeek(date);
    const key = `${date.getFullYear()}-W${weekNum}`;
    if (!weeks[key]) weeks[key] = { calls: 0, cost: 0, label: `Sem. ${weekNum}` };
    weeks[key].calls++;
    weeks[key].cost += parseFloat(u.cost_usd || 0);
  }
  return Object.values(weeks).sort((a, b) => b.label.localeCompare(a.label));
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
```

### Design

**Cards Haiku / Sonnet côte à côte :**
- Grille 2 colonnes, gap 12px
- Haiku : accent jaune (#eab308), icône 🟡
- Sonnet : accent violet (#a855f7), icône 🟣
- Chaque card : nb appels, tokens totaux (formatés k/M), coût estimé
- Fond surface, border, border-radius 10px

**Total mois :**
- Gros chiffre bold 20px, couleur orange
- "Total tout temps" en dessous, plus petit, muted

**Détail par semaine :**
- Liste compacte, chaque ligne : label semaine, nb appels, coût
- Max 8 semaines affichées

**Disclaimer :**
- Texte muted italic en bas : "⚠️ Coûts estimés sur la base de tarifs approximatifs. Consultez console.anthropic.com pour les coûts réels."

---

## NE PAS TOUCHER

- ❌ Le flow fonctionnel des API Routes (parsing, coaching) — on ajoute le logging APRÈS le traitement
- ❌ Schéma des autres tables
- ❌ Autres pages (sauf profil pour l'affichage)
- ❌ Le logging est fire-and-forget : si ça échoue, le flow continue normalement

---

## TEST AVANT COMMIT

1. Exécuter le SQL (CREATE TABLE api_usage) dans Supabase SQL Editor
2. Faire une séance avec parsing NLP → vérifier en DB : ligne dans api_usage (haiku, route=parse-seance)
3. Demander un coaching before → vérifier : ligne api_usage (sonnet, mode=before)
4. Coaching during → ligne api_usage (sonnet, mode=during)
5. Coaching after → ligne api_usage (sonnet, mode=after)
6. Vérifier les tokens : input_tokens > 0, output_tokens > 0, total_tokens = somme
7. Vérifier cost_usd > 0 (petit nombre, genre 0.001234)
8. Page /profil → section "Consommation API" visible
9. Vérifier les chiffres : nb appels, tokens, coûts cohérents avec ce qu'on vient de faire
10. Vérifier total mois vs total tout temps
11. Détail par semaine → au moins 1 semaine affichée
12. Erreur API (si testable) → le logging n'empêche pas le flow normal

---

## COMMIT + CLAUDE.md

**Commit :**
```
git add .
git commit -m "Suivi consommation API : table api_usage, logging tokens parse-seance et coaching, affichage profil (coûts estimés)"
git push
```

**Mise à jour CLAUDE.md — Ajouter :**
```
## Suivi consommation API
- Table api_usage : model, route, mode, input_tokens, output_tokens, total_tokens (generated), cost_usd
- Logging automatique fire-and-forget après chaque appel Haiku (parse-seance) et Sonnet (coaching)
- Coût estimé via utils/pricing.js (tarifs approximatifs, pas une facture)
- Affichage dans /profil : cards Haiku/Sonnet, total mois, total tout temps, détail par semaine
- RLS : usage_own (auth.uid() = user_id)
```

**Ajouter dans la liste des tables :**
```
api_usage : id, created_at, user_id, model, model_short, route, mode, input_tokens, output_tokens, total_tokens (generated), cost_usd
```