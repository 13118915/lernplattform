// ========================================================================
//  engine.js — Kern-Logik: FSRS-Grading, Gewichtung, Interleaving
// ========================================================================

import * as FSRS from './fsrs.js';
import * as DB from './db.js';

// ---------- FSRS Grading ----------

// Grade a card: 1=Again, 2=Hard, 3=Good, 4=Easy
export function gradeCard(questionId, grade) {
  const s = DB.getCardStats(questionId);
  const now = Date.now();
  const elapsedDays = s.last_review > 0 ? (now - s.last_review) / FSRS.DAY_MS : 0;
  const R = FSRS.retrievability(s.stability, elapsedDays);

  const updates = { seen: s.seen + 1, last_seen: now, last_review: now };

  if (s.state === 'new') {
    updates.stability = FSRS.initStability(grade);
    updates.difficulty = FSRS.initDifficulty(grade);
    if (grade === 1) {
      updates.state = 'learning'; updates.lapses = s.lapses + 1;
      updates.wrong = s.wrong + 1; updates.due = now + 60000;
    } else {
      updates.correct = s.correct + 1; updates.reps = s.reps + 1;
      updates.state = (grade === 4) ? 'review' : 'learning';
      updates.due = (grade === 4)
        ? now + FSRS.nextInterval(updates.stability) * FSRS.DAY_MS
        : now + (grade === 3 ? 10 * 60000 : 5 * 60000);
    }
  } else if (s.state === 'learning' || s.state === 'relearning') {
    updates.difficulty = FSRS.nextDifficulty(s.difficulty, grade);
    updates.stability = FSRS.shortTermStability(s.stability, grade);
    if (grade === 1) {
      updates.wrong = s.wrong + 1;
      if (s.state === 'relearning') updates.lapses = s.lapses + 1;
      updates.due = now + 60000;
    } else if (grade === 2) {
      updates.correct = s.correct + 1; updates.reps = s.reps + 1;
      updates.due = now + 5 * 60000;
    } else {
      updates.correct = s.correct + 1; updates.reps = s.reps + 1;
      updates.state = 'review';
      updates.due = now + FSRS.nextInterval(updates.stability) * FSRS.DAY_MS;
    }
  } else {
    // Review state
    updates.difficulty = FSRS.nextDifficulty(s.difficulty, grade);
    if (grade === 1) {
      updates.wrong = s.wrong + 1; updates.lapses = s.lapses + 1; updates.reps = 0;
      updates.stability = Math.max(0.1, FSRS.nextForgetStability(s.difficulty, s.stability, R));
      updates.state = 'relearning'; updates.due = now + 60000;
    } else {
      updates.correct = s.correct + 1; updates.reps = s.reps + 1;
      updates.stability = FSRS.nextRecallStability(s.difficulty, s.stability, R, grade);
      updates.due = now + FSRS.nextInterval(updates.stability) * FSRS.DAY_MS;
    }
  }

  DB.updateCardStats(questionId, updates);
  return DB.getCardStats(questionId);
}

// ---------- Retrievability ----------

export function getRetrievability(questionId) {
  const s = DB.getCardStats(questionId);
  if (s.state === 'new' || s.stability <= 0) return 0;
  const elapsed = (Date.now() - (s.last_review || s.last_seen || 0)) / FSRS.DAY_MS;
  return FSRS.retrievability(s.stability, elapsed);
}

// Human-readable next interval for rate buttons
export function getNextIntervalText(questionId, grade) {
  const s = DB.getCardStats(questionId);
  const now = Date.now();
  const elapsed = s.last_review > 0 ? (now - s.last_review) / FSRS.DAY_MS : 0;
  const R = FSRS.retrievability(s.stability, elapsed);

  const fmt = d => d + (d === 1 ? ' Tag' : ' Tage');

  if (s.state === 'new') {
    if (grade === 1) return '1 min';
    if (grade === 3) return '10 min';
    if (grade === 4) return fmt(FSRS.nextInterval(FSRS.initStability(4)));
  }
  if (s.state === 'learning' || s.state === 'relearning') {
    if (grade === 1) return '1 min';
    if (grade === 2) return '5 min';
    return fmt(FSRS.nextInterval(FSRS.shortTermStability(s.stability, grade)));
  }
  if (grade === 1) return '1 min';
  return fmt(FSRS.nextInterval(FSRS.nextRecallStability(s.difficulty, s.stability, R, grade)));
}

// ---------- Record Sprint Answer ----------

export function recordAnswer(questionId, wasCorrect, confident, format) {
  const s = DB.getCardStats(questionId);
  const updates = {
    seen: s.seen + 1,
    last_seen: Date.now()
  };
  if (format === 'mc') {
    updates.mc_seen = s.mc_seen + 1;
    if (wasCorrect) updates.mc_correct = s.mc_correct + 1;
  } else {
    updates.fill_seen = s.fill_seen + 1;
    if (wasCorrect) updates.fill_correct = s.fill_correct + 1;
  }
  if (wasCorrect) updates.correct = s.correct + 1;
  else {
    updates.wrong = s.wrong + 1;
    if (confident) updates.confident_wrong = s.confident_wrong + 1;
  }
  DB.updateCardStats(questionId, updates);
}

// ---------- Format Selection ----------

export function chooseFormat(question) {
  if (!question.fill_prompt) return 'mc';
  return Math.random() < 0.55 ? 'fill' : 'mc';
}

export function checkFillCorrect(question, given) {
  const accept = question.fill_accept ? JSON.parse(question.fill_accept) : [question.fill_answer];
  if (question.fill_case_sensitive) return accept.some(a => given === a);
  return accept.some(a => given.toLowerCase() === a.toLowerCase());
}

// ---------- Weighted Question Selection ----------

export function selectWeightedQuestions(questions, count) {
  const now = Date.now();
  const weighted = questions.map(q => {
    const s = DB.getCardStats(q.id);
    let w = 2;
    if (s.seen > 0) {
      const errorRate = s.wrong / s.seen;
      const daysSince = (now - s.last_seen) / FSRS.DAY_MS;
      const recency = Math.max(0, 1 - daysSince / 7);
      w = 1 + errorRate * 3 + Math.min(recency * 0.2, 2);
      if (s.confident_wrong > 0) w += 1.5;
    }
    return { q, w };
  });

  const selected = [];
  const remaining = weighted.slice();
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const total = remaining.reduce((sum, item) => sum + item.w, 0);
    let r = Math.random() * total, idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      r -= remaining[j].w;
      if (r <= 0) { idx = j; break; }
    }
    selected.push(remaining[idx].q);
    remaining.splice(idx, 1);
  }
  return selected;
}

// ---------- Interleaving Sort ----------

export function interleaveByTopic(items) {
  if (items.length <= 1) return items;
  const result = [];
  const remaining = items.slice();
  let lastTopic = null;
  while (remaining.length > 0) {
    let idx = remaining.findIndex(x => x.topic_id !== lastTopic);
    if (idx === -1) idx = 0;
    result.push(remaining[idx]);
    lastTopic = remaining[idx].topic_id;
    remaining.splice(idx, 1);
  }
  return result;
}

// ---------- Shuffle ----------

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Query Helpers ----------

export function getSubjects() {
  return DB.all('SELECT * FROM subjects ORDER BY sort_order, name');
}

export function getTopics(subjectId) {
  return DB.all('SELECT * FROM topics WHERE subject_id = ? ORDER BY sort_order', [subjectId]);
}

export function getQuestions(topicId) {
  return DB.all('SELECT * FROM questions WHERE topic_id = ? ORDER BY id', [topicId]);
}

export function getAllQuestions(subjectId) {
  return DB.all(`SELECT q.*, t.name as topic_name, t.color as topic_color, t.color_soft as topic_color_soft
                 FROM questions q JOIN topics t ON q.topic_id = t.id
                 WHERE t.subject_id = ? ORDER BY q.id`, [subjectId]);
}

export function getMerkwissen(topicId) {
  return DB.all('SELECT * FROM merkwissen WHERE topic_id = ? ORDER BY sort_order', [topicId]);
}

export function getSubjectStats(subjectId) {
  const allQs = getAllQuestions(subjectId);
  const now = Date.now();
  let total = 0, answered = 0, weak = 0, due = 0, newCount = 0, learning = 0, review = 0;

  for (const q of allQs) {
    total++;
    const s = DB.getCardStats(q.id);
    if (s.seen > 0) {
      answered++;
      if (s.wrong > s.correct) weak++;
      if (s.state === 'learning') learning++;
      else if (s.state === 'review') review++;
      if (s.due && s.due <= now && s.state !== 'new') due++;
    } else {
      newCount++;
    }
  }

  return { total, answered, weak, due, newCount, learning, review };
}
