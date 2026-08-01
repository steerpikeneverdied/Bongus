// Shared number formatter — the PROJECT-WIDE rule for displaying QUANTITY numbers
// (currencies, power, HP/ATK/DEF, damage, counts, costs). SINGLE SOURCE OF TRUTH —
// never hand-roll k/m abbreviation anywhere else; import fmtK.
//
//   under 1,000   →  the integer as-is        999, 42, 7
//   1,000+        →  "x.xxk"  (always 2 dp)    1,999 → "1.99k"   12,340 → "12.34k"
//   1,000,000+    →  "x.xxm"  (always 2 dp)    2,500,000 → "2.50m"
//
// Decimals are FLOORED (never overstate a balance). Sign preserved. Non-quantity
// text (timers "5.2s", percentages, ratios like "100/100") is NOT this function's job.
const floor2 = (x) => (Math.floor(x * 100) / 100).toFixed(2);
export const fmtK = (n) => {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e6) return sign + floor2(a / 1e6) + 'm';
  if (a >= 1e3) return sign + floor2(a / 1e3) + 'k';
  return String(v);
};

// Rounded k/m variant — NO decimals ("13k" not "13.05k"). For POWER ratings where 2 dp reads as
// noise. Rounds (not floors) so 13,050 → "13k". Same <1000 / k / m thresholds as fmtK. Same SSOT
// file — never hand-roll k/m elsewhere; import fmtKr.
export const fmtKr = (n) => {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e6) return sign + Math.round(a / 1e6) + 'm';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + 'k';
  return String(v);
};
