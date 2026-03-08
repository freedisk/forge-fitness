// Conversion centralisée kg ↔ lbs
export const toDisplay = (kg, unite) =>
  unite === 'lbs' ? Math.round(kg * 2.20462 * 10) / 10 : kg;

export const toKg = (val, unite) =>
  unite === 'lbs' ? Math.round(val / 2.20462 * 100) / 100 : val;

export const unitLabel = (unite) => unite === 'lbs' ? 'lbs' : 'kg';
