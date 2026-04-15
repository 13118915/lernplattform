// ========================================================================
//  FSRS-4.5 — Free Spaced Repetition Scheduler
//  Based on: Ye, J. (2024). A Stochastic Shortest Path Algorithm for
//  Optimizing Spaced Repetition Scheduling.
//  https://github.com/open-spaced-repetition/fsrs4.5
// ========================================================================

// Optimized default parameters (FSRS-4.5)
const w = [0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
           1.5330, 0.1418, 1.0070, 1.9395, 0.1100, 0.2939, 2.0075, 0.2424,
           2.9466, 0.5040, 0.6468];

export const TARGET_RETENTION = 0.9;
export const DAY_MS = 86400000;

// Power forgetting curve: R(t) = (1 + t / (9 * S))^(-1)
export function retrievability(stability, elapsedDays) {
  if (stability <= 0 || elapsedDays <= 0) return 1;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

// Next interval from stability (days until R drops to target)
export function nextInterval(stability) {
  return Math.max(1, Math.round(stability * 9 * (1 / TARGET_RETENTION - 1)));
}

// Initial stability after first rating (for new cards)
export function initStability(grade) {
  return Math.max(0.1, w[grade - 1]);
}

// Initial difficulty after first rating
export function initDifficulty(grade) {
  return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (grade - 1)) + 1));
}

// Update difficulty after review
export function nextDifficulty(d, grade) {
  const delta = -(w[6] * (grade - 3));
  const d2 = d + delta;
  const d3 = w[7] * initDifficulty(3) + (1 - w[7]) * d2;
  return Math.min(10, Math.max(1, d3));
}

// Stability after successful recall
export function nextRecallStability(d, s, r, grade) {
  const hardPenalty = (grade === 2) ? w[15] : 1;
  const easyBonus  = (grade === 4) ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp((1 - r) * w[10]) - 1) *
    hardPenalty * easyBonus);
}

// Stability after forgetting (lapse)
export function nextForgetStability(d, s, r) {
  return w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14]);
}

// Short-term stability for learning/relearning steps
export function shortTermStability(s, grade) {
  return s * Math.exp(w[17] * (grade - 3 + w[18]));
}
