// Tarifs approximatifs par million de tokens (mars 2026)
// Source : https://docs.anthropic.com/en/docs/about-claude/models
// ⚠️ Estimations — consulter console.anthropic.com pour les coûts réels

const PRICING = {
  haiku: { input: 0.80, output: 4.00 },
  sonnet: { input: 3.00, output: 15.00 },
}

// Calcul du coût estimé en USD
export function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['sonnet']
  return parseFloat(((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000).toFixed(6))
}

// Formatage du coût pour affichage
export function formatCost(costUsd) {
  if (costUsd < 0.01) return `< $0.01`
  return `$${costUsd.toFixed(2)}`
}

// Formatage des tokens pour affichage compact
export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}
