// Calcul du volume de séance — réutilisable partout
// Répétitions totales = somme de toutes les reps
// Charge totale (tonnage) = somme de (reps × poids_kg) — exercices PDC exclus du tonnage

export function calcVolumeSeance(series) {
  let totalReps = 0
  let totalCharge = 0 // en kg

  for (const s of (series || [])) {
    const reps = s.repetitions || 0
    const poids = s.poids_kg || 0 // null = poids du corps → 0 pour le tonnage
    totalReps += reps
    totalCharge += reps * poids
  }

  return { totalReps, totalCharge }
}

// Formatage du tonnage pour l'affichage (kg, lbs, tonnes)
export function formatCharge(chargeKg, unite) {
  if (unite === 'lbs') {
    const chargeLbs = Math.round(chargeKg * 2.20462)
    return chargeLbs >= 1000
      ? `${(chargeLbs / 1000).toFixed(1)}t`
      : `${chargeLbs} lbs`
  }
  return chargeKg >= 1000
    ? `${(chargeKg / 1000).toFixed(1)}t`
    : `${Math.round(chargeKg)} kg`
}
